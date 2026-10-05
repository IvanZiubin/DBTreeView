using System.Net;
using Microsoft.EntityFrameworkCore;
using TreeEditor.Api.Tests.Infrastructure;
using Xunit;

namespace TreeEditor.Api.Tests.Apply;

[Collection(ApiCollection.Name)]
public sealed class ApplyAtomicityTests(ApiFactory factory) : IntegrationTestBase(factory)
{
    [Fact]
    public async Task Failure_in_later_operation_rolls_everything_back()
    {
        await Factory.WithDbAsync(async db =>
        {
            await db.Database.ExecuteSqlRawAsync("""
                CREATE OR REPLACE FUNCTION test_fail_on_boom() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.value = 'boom' THEN RAISE EXCEPTION 'boom'; END IF; RETURN NEW; END; $$
                """);
            await db.Database.ExecuteSqlRawAsync(
                "CREATE TRIGGER trg_test_fail_on_boom BEFORE UPDATE OF value ON nodes FOR EACH ROW EXECUTE FUNCTION test_fail_on_boom()");
        });

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
            await Factory.WithDbAsync(async db =>
            {
                await db.Database.ExecuteSqlRawAsync("DROP TRIGGER IF EXISTS trg_test_fail_on_boom ON nodes");
                await db.Database.ExecuteSqlRawAsync("DROP FUNCTION IF EXISTS test_fail_on_boom()");
            });
        }
    }
}
