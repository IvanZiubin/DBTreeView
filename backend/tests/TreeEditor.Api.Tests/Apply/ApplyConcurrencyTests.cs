using System.Net;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using TreeEditor.Api.Features.Apply;
using TreeEditor.Api.Infrastructure;
using TreeEditor.Api.Tests.Infrastructure;
using Xunit;

namespace TreeEditor.Api.Tests.Apply;

[Collection(ApiCollection.Name)]
public sealed class ApplyConcurrencyTests(ApiFactory factory) : IntegrationTestBase(factory)
{
    private async Task AssertBlockedByAdvisoryLockAsync(Func<Task<HttpResponseMessage>> send)
    {
        await using var conn = new NpgsqlConnection(Factory.ConnectionString);
        await conn.OpenAsync();
        await using (var lockCmd = new NpgsqlCommand($"SELECT pg_advisory_lock({DbLocks.TreeWriteLockKey})", conn))
        {
            await lockCmd.ExecuteNonQueryAsync();
        }

        var pending = send();
        var winner = await Task.WhenAny(pending, Task.Delay(500));
        Assert.NotSame(pending, winner);

        await using (var unlockCmd = new NpgsqlCommand($"SELECT pg_advisory_unlock({DbLocks.TreeWriteLockKey})", conn))
        {
            await unlockCmd.ExecuteNonQueryAsync();
        }

        var done = await Task.WhenAny(pending, Task.Delay(TimeSpan.FromSeconds(5)));
        Assert.Same(pending, done);
        Assert.Equal(HttpStatusCode.OK, (await pending).StatusCode);
    }

    [Fact]
    public Task Advisory_lock_blocks_apply() =>
        AssertBlockedByAdvisoryLockAsync(() => Client.ApplyAsync(ApplyHttp.EmptyRequest));

    [Fact]
    public Task Advisory_lock_blocks_reset() =>
        AssertBlockedByAdvisoryLockAsync(() => Client.PostAsync("/api/reset", null));

    [Fact]
    public async Task Parallel_add_vs_ancestor_cascade_keeps_invariant()
    {
        for (var round = 0; round < 10; round++)
        {
            await Factory.ResetDatabaseAsync();

            var a = Client.ApplyAsync("""{"edits":[],"adds":[{"tempId":"t","parentId":26,"value":"race"}],"deletes":[]}""");
            var b = Client.ApplyAsync("""{"edits":[],"adds":[],"deletes":[1]}""");
            await Task.WhenAll(a, b);

            Assert.Equal(HttpStatusCode.OK, b.Result.StatusCode);
            Assert.True(a.Result.StatusCode is HttpStatusCode.OK or HttpStatusCode.Conflict, $"round {round}: {a.Result.StatusCode}");
            if (a.Result.StatusCode == HttpStatusCode.OK)
            {
                var body = await System.Net.Http.Json.HttpContentJsonExtensions.ReadFromJsonAsync<ApplyResponse>(a.Result.Content);
                var id = body!.IdMap["t"];
                await Factory.WithDbAsync(async db => Assert.True((await db.Nodes.FindAsync(id))!.IsDeleted));
            }

            var violations = await Factory.WithDbAsync(db => db.Database.SqlQueryRaw<int>(ApplyHttp.InvariantSql).SingleAsync());
            Assert.Equal(0, violations);
        }
    }
}
