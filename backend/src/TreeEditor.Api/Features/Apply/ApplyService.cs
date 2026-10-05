using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage;
using Npgsql;
using NpgsqlTypes;
using TreeEditor.Api.Data;
using TreeEditor.Api.Features.Nodes;
using TreeEditor.Api.Infrastructure;

namespace TreeEditor.Api.Features.Apply;

/// <summary>
/// Executes a validated apply command in one transaction serialized by DbLocks.
/// Order: lock -> 404 check -> 409 check -> adds (parents first) -> edits -> cascade deletes -> response.
/// Returning before CommitAsync disposes the transaction, which rolls back.
/// </summary>
public sealed class ApplyService(TreeDbContext db)
{
    public async Task<ApplyOutcome> ApplyAsync(ApplyCommand command, CancellationToken ct)
    {
        await using var transaction = await db.Database.BeginTransactionAsync(ct);
        await DbLocks.AcquireTreeWriteLockAsync(db, ct);

        var connection = (NpgsqlConnection)db.Database.GetDbConnection();
        var npgsqlTransaction = (NpgsqlTransaction)transaction.GetDbTransaction();

        var editIds = command.Edits.Select(e => e.Id).ToArray();
        var realParentIds = command.Adds
            .Where(a => a.ParentId.HasValue)
            .Select(a => a.ParentId.GetValueOrDefault())
            .ToArray();
        var referencedIds = editIds.Concat(command.DeleteIds).Concat(realParentIds).Distinct().ToArray();

        var isDeletedById = await LockNodesAsync(connection, npgsqlTransaction, referencedIds, ct);

        var missingIds = referencedIds.Where(id => !isDeletedById.ContainsKey(id)).Order().ToArray();
        if (missingIds.Length > 0)
        {
            return new ApplyOutcome.NotFound(missingIds);
        }

        var conflictIds = editIds.Concat(realParentIds).Where(id => isDeletedById[id]).Distinct().Order().ToArray();
        if (conflictIds.Length > 0)
        {
            return new ApplyOutcome.Conflict(conflictIds);
        }

        var idMap = await InsertAddsAsync(connection, npgsqlTransaction, command.Adds, ct);
        await UpdateEditsAsync(connection, npgsqlTransaction, command.Edits, ct);
        await CascadeDeleteAsync(connection, npgsqlTransaction, command.DeleteIds, ct);

        var responseIds = editIds
            .Concat(command.DeleteIds)
            .Concat(idMap.Values)
            .Concat(command.RefreshIds)
            .Distinct()
            .ToArray();
        var nodes = await LoadNodeDetailsAsync(connection, npgsqlTransaction, responseIds, ct);

        await transaction.CommitAsync(ct);
        return new ApplyOutcome.Success(new ApplyResponse(idMap, nodes));
    }

    private static async Task<Dictionary<long, bool>> LockNodesAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        long[] ids,
        CancellationToken ct)
    {
        var isDeletedById = new Dictionary<long, bool>(ids.Length);
        if (ids.Length == 0)
        {
            return isDeletedById;
        }

        await using var cmd = new NpgsqlCommand(ApplySql.LockReferencedNodes, connection, transaction);
        cmd.Parameters.Add(BigintArray("ids", ids));
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            isDeletedById[reader.GetInt64(0)] = reader.GetBoolean(1);
        }

        return isDeletedById;
    }

    private static async Task<Dictionary<string, long>> InsertAddsAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        IReadOnlyList<ValidatedAdd> adds,
        CancellationToken ct)
    {
        var idMap = new Dictionary<string, long>(adds.Count, StringComparer.Ordinal);
        if (adds.Count == 0)
        {
            return idMap;
        }

        var newIds = await AllocateIdsAsync(connection, transaction, adds.Count, ct);

        var ids = new long[adds.Count];
        var parentIds = new long[adds.Count];
        var values = new string[adds.Count];
        for (var i = 0; i < adds.Count; i++)
        {
            var add = adds[i];
            ids[i] = newIds[i];
            idMap[add.TempId] = newIds[i];
            parentIds[i] = add.ParentId ?? idMap[add.ParentTempId!];
            values[i] = add.Value;
        }

        await using var cmd = new NpgsqlCommand(ApplySql.InsertAdds, connection, transaction);
        cmd.Parameters.Add(BigintArray("ids", ids));
        cmd.Parameters.Add(BigintArray("parentIds", parentIds));
        cmd.Parameters.Add(TextArray("nodeValues", values));
        await cmd.ExecuteNonQueryAsync(ct);

        return idMap;
    }

    private static async Task<List<long>> AllocateIdsAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        int count,
        CancellationToken ct)
    {
        var newIds = new List<long>(count);
        await using var cmd = new NpgsqlCommand(ApplySql.AllocateIds, connection, transaction);
        cmd.Parameters.Add(new NpgsqlParameter("count", NpgsqlDbType.Integer) { Value = count });
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            newIds.Add(reader.GetInt64(0));
        }

        return newIds;
    }

    private static async Task UpdateEditsAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        IReadOnlyList<ValidatedEdit> edits,
        CancellationToken ct)
    {
        if (edits.Count == 0)
        {
            return;
        }

        await using var cmd = new NpgsqlCommand(ApplySql.UpdateEdits, connection, transaction);
        cmd.Parameters.Add(BigintArray("ids", edits.Select(e => e.Id).ToArray()));
        cmd.Parameters.Add(TextArray("nodeValues", edits.Select(e => e.Value).ToArray()));
        await cmd.ExecuteNonQueryAsync(ct);
    }

    private static async Task CascadeDeleteAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        IReadOnlyList<long> deleteIds,
        CancellationToken ct)
    {
        if (deleteIds.Count == 0)
        {
            return;
        }

        await using var cmd = new NpgsqlCommand(ApplySql.CascadeDelete, connection, transaction);
        cmd.Parameters.Add(BigintArray("ids", deleteIds.ToArray()));
        await cmd.ExecuteNonQueryAsync(ct);
    }

    private static async Task<List<NodeDetailsDto>> LoadNodeDetailsAsync(
        NpgsqlConnection connection,
        NpgsqlTransaction transaction,
        long[] ids,
        CancellationToken ct)
    {
        var nodes = new List<NodeDetailsDto>(ids.Length);
        if (ids.Length == 0)
        {
            return nodes;
        }

        await using var cmd = new NpgsqlCommand(ApplySql.LoadNodeDetails, connection, transaction);
        cmd.Parameters.Add(BigintArray("ids", ids));
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct))
        {
            long? parentId = reader.IsDBNull(1) ? null : reader.GetInt64(1);
            nodes.Add(new NodeDetailsDto(
                reader.GetInt64(0),
                parentId,
                reader.GetString(2),
                reader.GetBoolean(3),
                reader.GetBoolean(4),
                reader.GetFieldValue<long[]>(5)));
        }

        return nodes;
    }

    private static NpgsqlParameter BigintArray(string name, long[] values) =>
        new(name, NpgsqlDbType.Array | NpgsqlDbType.Bigint) { Value = values };

    private static NpgsqlParameter TextArray(string name, string[] values) =>
        new(name, NpgsqlDbType.Array | NpgsqlDbType.Text) { Value = values };
}
