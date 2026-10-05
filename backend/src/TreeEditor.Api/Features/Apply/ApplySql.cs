namespace TreeEditor.Api.Features.Apply;

/// <summary>Set-based SQL used by ApplyService. Parameters are Npgsql named parameters.</summary>
internal static class ApplySql
{
    /// <summary>@ids bigint[]. Locks referenced rows in id order; missing ids simply produce no row.</summary>
    public const string LockReferencedNodes = """
        SELECT id, is_deleted
        FROM nodes
        WHERE id = ANY(@ids)
        ORDER BY id
        FOR UPDATE
        """;

    /// <summary>@count integer. Returns @count new ids from the identity sequence, ascending.</summary>
    public const string AllocateIds = """
        SELECT nextval(pg_get_serial_sequence('nodes', 'id'))
        FROM generate_series(1, @count)
        ORDER BY 1
        """;

    /// <summary>@ids bigint[], @parentIds bigint[], @nodeValues text[]. FK is checked at end of statement.</summary>
    public const string InsertAdds = """
        INSERT INTO nodes (id, parent_id, value, is_deleted)
        SELECT a.id, a.parent_id, a.value, FALSE
        FROM unnest(@ids, @parentIds, @nodeValues) AS a(id, parent_id, value)
        """;

    /// <summary>@ids bigint[], @nodeValues text[].</summary>
    public const string UpdateEdits = """
        UPDATE nodes AS n
        SET value = e.value
        FROM unnest(@ids, @nodeValues) AS e(id, value)
        WHERE n.id = e.id
        """;

    /// <summary>@ids bigint[]. Soft-deletes the ids and all their DB descendants (loaded or not).</summary>
    public const string CascadeDelete = """
        WITH RECURSIVE subtree AS (
            SELECT n.id FROM nodes n WHERE n.id = ANY(@ids)
            UNION
            SELECT c.id FROM nodes c JOIN subtree s ON c.parent_id = s.id
        )
        UPDATE nodes SET is_deleted = TRUE
        WHERE id IN (SELECT id FROM subtree) AND is_deleted = FALSE
        """;

    /// <summary>
    /// @ids bigint[]. NodeDetails for every existing id (missing ids are skipped), ordered by id.
    /// Columns: id, parent_id, value, is_deleted, has_children, ancestor_ids (root -> parent).
    /// </summary>
    public const string LoadNodeDetails = """
        WITH RECURSIVE targets AS (
            SELECT n.id, n.parent_id, n.value, n.is_deleted
            FROM nodes n
            WHERE n.id = ANY(@ids)
        ),
        ancestors AS (
            SELECT t.id AS origin_id, p.id AS ancestor_id, p.parent_id, 1 AS depth
            FROM targets t
            JOIN nodes p ON p.id = t.parent_id
            UNION ALL
            SELECT a.origin_id, p.id, p.parent_id, a.depth + 1
            FROM ancestors a
            JOIN nodes p ON p.id = a.parent_id
        ),
        ancestor_lists AS (
            SELECT origin_id, array_agg(ancestor_id ORDER BY depth DESC) AS ancestor_ids
            FROM ancestors
            GROUP BY origin_id
        )
        SELECT t.id,
               t.parent_id,
               t.value,
               t.is_deleted,
               EXISTS (SELECT 1 FROM nodes c WHERE c.parent_id = t.id) AS has_children,
               COALESCE(l.ancestor_ids, ARRAY[]::bigint[]) AS ancestor_ids
        FROM targets t
        LEFT JOIN ancestor_lists l ON l.origin_id = t.id
        ORDER BY t.id
        """;
}
