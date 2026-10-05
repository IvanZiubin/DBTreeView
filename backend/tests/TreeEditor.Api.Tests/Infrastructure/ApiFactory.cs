using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Testcontainers.PostgreSql;
using TreeEditor.Api.Data;
using Xunit;

namespace TreeEditor.Api.Tests.Infrastructure;

public sealed class ApiFactory : WebApplicationFactory<Program>, IAsyncLifetime
{
    private readonly PostgreSqlContainer _db = new PostgreSqlBuilder()
        .WithImage("postgres:16")
        .WithDatabase("treeeditor_test")
        .WithUsername("tree")
        .WithPassword("tree")
        .Build();

    public string ConnectionString => _db.GetConnectionString();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("ConnectionStrings:Default", _db.GetConnectionString());
    }

    public Task InitializeAsync() => _db.StartAsync();

    async Task IAsyncLifetime.DisposeAsync()
    {
        await base.DisposeAsync();
        await _db.DisposeAsync();
    }

    /// <summary>Restores the seed (same code path as POST /api/reset).</summary>
    public async Task ResetDatabaseAsync()
    {
        await using var scope = Services.CreateAsyncScope();
        var seeder = scope.ServiceProvider.GetRequiredService<TreeSeeder>();
        await seeder.ResetAsync(CancellationToken.None);
    }

    /// <summary>Runs an action against a fresh TreeDbContext (for arranging/asserting DB state directly).</summary>
    public async Task WithDbAsync(Func<TreeDbContext, Task> action)
    {
        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TreeDbContext>();
        await action(db);
    }

    public async Task<T> WithDbAsync<T>(Func<TreeDbContext, Task<T>> action)
    {
        await using var scope = Services.CreateAsyncScope();
        var db = scope.ServiceProvider.GetRequiredService<TreeDbContext>();
        return await action(db);
    }
}
