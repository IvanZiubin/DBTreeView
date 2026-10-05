using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using TreeEditor.Api.Data;
using TreeEditor.Api.Features.Apply;
using TreeEditor.Api.Features.Nodes;
using TreeEditor.Api.Tests.Infrastructure;
using Xunit;

namespace TreeEditor.Api.Tests.Reset;

[Collection(ApiCollection.Name)]
public sealed class ResetTests(ApiFactory factory) : IntegrationTestBase(factory)
{
    [Fact]
    public async Task Reset_restores_values_and_flags()
    {
        await Factory.WithDbAsync(async db =>
        {
            (await db.Nodes.FindAsync(1L))!.Value = "changed";
            (await db.Nodes.FindAsync(2L))!.IsDeleted = true;
            await db.SaveChangesAsync();
        });

        var response = await Client.PostAsync("/api/reset", null);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var roots = await response.Content.ReadFromJsonAsync<List<NodeDto>>();
        Assert.NotNull(roots);
        Assert.Equal(new long[] { 1, 2, 3 }, roots.Select(r => r.Id).ToArray());
        Assert.Equal("Electronics", roots.Single(r => r.Id == 1).Value);
        Assert.False(roots.Single(r => r.Id == 2).IsDeleted);
    }

    [Fact]
    public async Task Reset_removes_added_rows_and_restarts_identity_at_31()
    {
        await Factory.WithDbAsync(async db =>
        {
            var a = new Node { ParentId = 30, Value = "a" };
            var b = new Node { ParentId = 30, Value = "b" };
            db.Nodes.AddRange(a, b);
            await db.SaveChangesAsync();
            Assert.Equal(31L, a.Id);
            Assert.Equal(32L, b.Id);
        });

        var response = await Client.PostAsync("/api/reset", null);
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);

        await Factory.WithDbAsync(async db =>
        {
            Assert.Equal(30, await db.Nodes.CountAsync());
            Assert.Equal(30L, await db.Nodes.MaxAsync(n => n.Id));
        });

        var newId = await Factory.WithDbAsync(async db =>
        {
            var n = new Node { ParentId = 30, Value = "after" };
            db.Nodes.Add(n);
            await db.SaveChangesAsync();
            return n.Id;
        });
        Assert.Equal(31L, newId);
    }

    [Fact]
    public async Task After_reset_all_rows_equal_seed_exactly()
    {
        await Factory.WithDbAsync(async db =>
        {
            (await db.Nodes.FindAsync(5L))!.Value = "mutated";
            (await db.Nodes.FindAsync(6L))!.IsDeleted = true;
            db.Nodes.Add(new Node { ParentId = 1, Value = "extra" });
            await db.SaveChangesAsync();
        });

        await Client.PostAsync("/api/reset", null);

        var rows = await Factory.WithDbAsync(db => db.Nodes.AsNoTracking().OrderBy(n => n.Id).ToListAsync());
        Assert.Equal(SeedData.Nodes.Count, rows.Count);
        for (var i = 0; i < rows.Count; i++)
        {
            Assert.Equal(SeedData.Nodes[i].Id, rows[i].Id);
            Assert.Equal(SeedData.Nodes[i].ParentId, rows[i].ParentId);
            Assert.Equal(SeedData.Nodes[i].Value, rows[i].Value);
            Assert.False(rows[i].IsDeleted);
        }
    }

    [Fact]
    public async Task Reset_twice_returns_same_body()
    {
        var r1 = await Client.PostAsync("/api/reset", null);
        var r2 = await Client.PostAsync("/api/reset", null);

        Assert.Equal(HttpStatusCode.OK, r1.StatusCode);
        Assert.Equal(HttpStatusCode.OK, r2.StatusCode);
        Assert.Equal(await r1.Content.ReadAsStringAsync(), await r2.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Seed_max_depth_is_5()
    {
        var depth = await Factory.WithDbAsync(db => db.Database.SqlQueryRaw<int>("""
            WITH RECURSIVE t AS (
                SELECT id, 1 AS d FROM nodes WHERE parent_id IS NULL
                UNION ALL
                SELECT n.id, t.d + 1 FROM nodes n JOIN t ON n.parent_id = t.id
            )
            SELECT MAX(d) AS "Value" FROM t
            """).SingleAsync());

        Assert.Equal(5, depth);
    }

    [Fact]
    public async Task Reset_after_apply_restores_seed_and_sequence()
    {
        var applied = await Client.ApplyAsync("""
            {"edits":[{"id":1,"value":"x"}],"adds":[{"tempId":"t","parentId":30,"value":"n"}],"deletes":[2]}
            """);
        Assert.Equal(HttpStatusCode.OK, applied.StatusCode);

        var reset = await Client.PostAsync("/api/reset", null);
        Assert.Equal(HttpStatusCode.OK, reset.StatusCode);

        var rows = await Factory.WithDbAsync(db => db.Nodes.AsNoTracking().OrderBy(n => n.Id).ToListAsync());
        Assert.Equal(30, rows.Count);
        for (var i = 0; i < rows.Count; i++)
        {
            Assert.Equal(SeedData.Nodes[i].Id, rows[i].Id);
            Assert.Equal(SeedData.Nodes[i].ParentId, rows[i].ParentId);
            Assert.Equal(SeedData.Nodes[i].Value, rows[i].Value);
            Assert.False(rows[i].IsDeleted);
        }

        var next = await Client.ApplyAsync("""{"edits":[],"adds":[{"tempId":"t","parentId":30,"value":"n"}],"deletes":[]}""");
        var body = await next.Content.ReadFromJsonAsync<ApplyResponse>();
        Assert.Equal(31, body!.IdMap["t"]);
    }
}
