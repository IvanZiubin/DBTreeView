using Microsoft.EntityFrameworkCore;

namespace TreeEditor.Api.Data;

public static class DatabaseInitializer
{
    public const int MaxAttempts = 30;
    private static readonly TimeSpan RetryDelay = TimeSpan.FromSeconds(2);

    /// <summary>Applies migrations and seeds an empty table. Retries while the database is starting.</summary>
    public static async Task InitializeAsync(IServiceProvider services, CancellationToken ct)
    {
        var logger = services.GetRequiredService<ILoggerFactory>().CreateLogger(nameof(DatabaseInitializer));

        for (var attempt = 1; ; attempt++)
        {
            try
            {
                await using var scope = services.CreateAsyncScope();
                var db = scope.ServiceProvider.GetRequiredService<TreeDbContext>();
                await db.Database.MigrateAsync(ct);

                var seeder = scope.ServiceProvider.GetRequiredService<TreeSeeder>();
                var seeded = await seeder.SeedIfEmptyAsync(ct);

                logger.LogInformation(
                    "Database initialized on attempt {Attempt}; seed inserted: {Seeded}", attempt, seeded);
                return;
            }
            catch (Exception ex) when (attempt < MaxAttempts && !ct.IsCancellationRequested)
            {
                logger.LogWarning(
                    ex,
                    "Database initialization attempt {Attempt}/{MaxAttempts} failed; retrying in {DelaySeconds}s",
                    attempt,
                    MaxAttempts,
                    RetryDelay.TotalSeconds);
                await Task.Delay(RetryDelay, ct);
            }
        }
    }
}
