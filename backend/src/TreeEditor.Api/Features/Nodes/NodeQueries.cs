using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using TreeEditor.Api.Data;

namespace TreeEditor.Api.Features.Nodes;

public static class NodeQueries
{
    private static readonly Expression<Func<Node, NodeDto>> ToDto =
        n => new NodeDto(n.Id, n.ParentId, n.Value, n.IsDeleted, n.Children.Any());

    public static Task<List<NodeDto>> GetRootsAsync(TreeDbContext db, CancellationToken ct) =>
        db.Nodes
            .AsNoTracking()
            .Where(n => n.ParentId == null)
            .OrderBy(n => n.Id)
            .Select(ToDto)
            .ToListAsync(ct);

    public static Task<List<NodeDto>> GetChildrenAsync(TreeDbContext db, long parentId, CancellationToken ct) =>
        db.Nodes
            .AsNoTracking()
            .Where(n => n.ParentId == parentId)
            .OrderBy(n => n.Id)
            .Select(ToDto)
            .ToListAsync(ct);

    public static Task<bool> ExistsAsync(TreeDbContext db, long id, CancellationToken ct) =>
        db.Nodes.AnyAsync(n => n.Id == id, ct);

    /// <summary>Ancestor ids ordered root -> parent. Empty for a root or a missing id.</summary>
    public static Task<List<long>> GetAncestorIdsAsync(TreeDbContext db, long id, CancellationToken ct) =>
        db.Database
            .SqlQuery<long>($"""
                WITH RECURSIVE ancestors AS (
                    SELECT p.id, p.parent_id, 1 AS depth
                    FROM nodes c
                    JOIN nodes p ON p.id = c.parent_id
                    WHERE c.id = {id}
                    UNION ALL
                    SELECT p.id, p.parent_id, a.depth + 1
                    FROM ancestors a
                    JOIN nodes p ON p.id = a.parent_id
                )
                SELECT a.id AS "Value"
                FROM ancestors a
                ORDER BY a.depth DESC
                """)
            .ToListAsync(ct);

    /// <summary>Node with ancestry, or null if the id does not exist.</summary>
    public static async Task<NodeDetailsDto?> GetNodeDetailsAsync(TreeDbContext db, long id, CancellationToken ct)
    {
        var node = await db.Nodes
            .AsNoTracking()
            .Where(n => n.Id == id)
            .Select(ToDto)
            .SingleOrDefaultAsync(ct);

        if (node is null)
        {
            return null;
        }

        var ancestorIds = await GetAncestorIdsAsync(db, id, ct);
        return new NodeDetailsDto(node.Id, node.ParentId, node.Value, node.IsDeleted, node.HasChildren, ancestorIds);
    }
}
