using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace TreeEditor.Api.Data;

public sealed class TreeSeeder(TreeDbContext db)
{
    private const string InsertSeedSql = """
        INSERT INTO nodes (id, parent_id, value, is_deleted)
        SELECT s.id, NULLIF(s.parent_id, 0), s.value, FALSE
        FROM unnest(@nodeIds, @parentIds, @nodeValues) AS s(id, parent_id, value)
        """;

    private const string RestartSequenceSql =
        "SELECT setval(pg_get_serial_sequence('nodes', 'id'), (SELECT MAX(id) FROM nodes))";

    private const string TruncateSql = "TRUNCATE TABLE nodes RESTART IDENTITY";

    /// <summary>Inserts the seed when the table is empty. Returns true if it seeded.</summary>
    public async Task<bool> SeedIfEmptyAsync(CancellationToken ct)
    {
        if (await db.Nodes.AnyAsync(ct))
        {
            return false;
        }

        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await InsertSeedAsync(ct);
        await tx.CommitAsync(ct);
        return true;
    }

    /// <summary>Deletes all rows and restores the seed with fixed ids, in one transaction.</summary>
    public async Task ResetAsync(CancellationToken ct)
    {
        await using var tx = await db.Database.BeginTransactionAsync(ct);
        await db.Database.ExecuteSqlRawAsync(TruncateSql, ct);
        await InsertSeedAsync(ct);
        await tx.CommitAsync(ct);
        db.ChangeTracker.Clear();
    }

    private async Task InsertSeedAsync(CancellationToken ct)
    {
        var nodeIds = SeedData.Nodes.Select(n => n.Id).ToArray();
        var parentIds = SeedData.Nodes.Select(n => n.ParentId ?? 0L).ToArray();
        var nodeValues = SeedData.Nodes.Select(n => n.Value).ToArray();

        await db.Database.ExecuteSqlRawAsync(
            InsertSeedSql,
            new object[]
            {
                new NpgsqlParameter("nodeIds", nodeIds),
                new NpgsqlParameter("parentIds", parentIds),
                new NpgsqlParameter("nodeValues", nodeValues),
            },
            ct);

        await db.Database.ExecuteSqlRawAsync(RestartSequenceSql, ct);
    }
}
