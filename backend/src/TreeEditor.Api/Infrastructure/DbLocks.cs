using Microsoft.EntityFrameworkCore;
using TreeEditor.Api.Data;

namespace TreeEditor.Api.Infrastructure;

/// <summary>
/// Transaction-scoped PostgreSQL advisory lock that serializes every tree write
/// (POST /api/nodes/apply, POST /api/reset, startup seed). Must be the first statement
/// after BEGIN; released automatically on COMMIT or ROLLBACK.
/// </summary>
public static class DbLocks
{
    public const long TreeWriteLockKey = 4242;

    public static Task AcquireTreeWriteLockAsync(TreeDbContext db, CancellationToken ct) =>
        db.Database.ExecuteSqlAsync($"SELECT pg_advisory_xact_lock({TreeWriteLockKey})", ct);
}
