using System.Net;
using Microsoft.EntityFrameworkCore;
using TreeEditor.Api.Tests.Infrastructure;
using Xunit;

namespace TreeEditor.Api.Tests.Apply;

[Collection(ApiCollection.Name)]
public sealed class ApplyAtomicityTests(ApiFactory factory) : IntegrationTestBase(factory)
{
    // Test-only trigger that makes any UPDATE setting value = 'boom' fail. Reset does not drop triggers,
    // so every test that installs it drops it in finally.
    private Task InstallBoomTriggerAsync() =>
        Factory.WithDbAsync(async db =>
        {
            await db.Database.ExecuteSqlRawAsync("""
                CREATE OR REPLACE FUNCTION test_fail_on_boom() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.value = 'boom' THEN RAISE EXCEPTION 'boom'; END IF; RETURN NEW; END; $$
                """);
            await db.Database.ExecuteSqlRawAsync(
                "CREATE TRIGGER trg_test_fail_on_boom BEFORE UPDATE OF value ON nodes FOR EACH ROW EXECUTE FUNCTION test_fail_on_boom()");
        });

    private Task DropBoomTriggerAsync() =>
        Factory.WithDbAsync(async db =>
        {
            await db.Database.ExecuteSqlRawAsync("DROP TRIGGER IF EXISTS trg_test_fail_on_boom ON nodes");
            await db.Database.ExecuteSqlRawAsync("DROP FUNCTION IF EXISTS test_fail_on_boom()");
        });

    [Fact]
    public async Task Failure_in_later_operation_rolls_everything_back()
    {
        await InstallBoomTriggerAsync();
        try
        {
            var response = await Client.ApplyAsync("""
                {"edits":[{"id":3,"value":"boom"}],"adds":[{"tempId":"t1","parentId":2,"value":"New"}],"deletes":[7]}
                """);

            Assert.Equal(HttpStatusCode.InternalServerError, response.StatusCode);
            Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
            await Factory.WithDbAsync(async db =>
            {
                Assert.Equal(30, await db.Nodes.CountAsync());
                Assert.Equal("Home and Garden", (await db.Nodes.FindAsync(3L))!.Value);
                Assert.False((await db.Nodes.FindAsync(7L))!.IsDeleted);
            });
        }
        finally
        {
            await DropBoomTriggerAsync();
        }
    }

    // Known behaviour (stage-3 open risk 4): ids drawn by a rolled-back apply are never reused.
    [Fact]
    public async Task Rolled_back_adds_leave_a_sequence_gap()
    {
        await InstallBoomTriggerAsync();
        try
        {
            var failed = await Client.ApplyAsync("""
                {"edits":[{"id":3,"value":"boom"}],"adds":[{"tempId":"t1","parentId":2,"value":"New"},{"tempId":"t2","parentTempId":"t1","value":"New child"}],"deletes":[]}
                """);
            Assert.Equal(HttpStatusCode.InternalServerError, failed.StatusCode);
        }
        finally
        {
            await DropBoomTriggerAsync();
        }

        var next = await Client.ApplyOkAsync("""{"edits":[],"adds":[{"tempId":"t","parentId":2,"value":"After failure"}],"deletes":[]}""");

        Assert.Equal(33, next.IdMap["t"]);
        await Factory.WithDbAsync(async db =>
        {
            Assert.Equal(31, await db.Nodes.CountAsync());
            Assert.False(await db.Nodes.AnyAsync(n => n.Id == 31 || n.Id == 32));
        });
    }

    // 400 is rejected before the DB, 404/409 before ids are allocated: none of them consumes an id.
    [Fact]
    public async Task Validation_not_found_and_conflict_failures_consume_no_ids()
    {
        await Client.ApplyOkAsync("""{"edits":[],"adds":[],"deletes":[5]}""");

        var conflict = await Client.ApplyAsync("""{"edits":[],"adds":[{"tempId":"t","parentId":5,"value":"x"}],"deletes":[]}""");
        Assert.Equal(HttpStatusCode.Conflict, conflict.StatusCode);
        var notFound = await Client.ApplyAsync("""{"edits":[],"adds":[{"tempId":"t","parentId":999999,"value":"x"}],"deletes":[]}""");
        Assert.Equal(HttpStatusCode.NotFound, notFound.StatusCode);
        var invalid = await Client.ApplyAsync("""{"edits":[],"adds":[{"tempId":"t","parentId":3,"value":"   "}],"deletes":[]}""");
        Assert.Equal(HttpStatusCode.BadRequest, invalid.StatusCode);

        var next = await Client.ApplyOkAsync("""{"edits":[],"adds":[{"tempId":"t","parentId":3,"value":"ok"}],"deletes":[]}""");

        Assert.Equal(31, next.IdMap["t"]);
    }
}
