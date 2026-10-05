using System.Net;
using Microsoft.EntityFrameworkCore;
using TreeEditor.Api.Tests.Infrastructure;
using Xunit;

namespace TreeEditor.Api.Tests.Apply;

/// <summary>
/// Stage-4 client flows (api-contract client_rules): requests shaped exactly as the cache builds them —
/// top-most deletes only, refreshIds = every cached real id ascending, temp chains in any order.
/// </summary>
[Collection(ApiCollection.Name)]
public sealed class ApplyClientFlowTests(ApiFactory factory) : IntegrationTestBase(factory), IAsyncLifetime
{
    // Re-implements IAsyncLifetime so the invariant is checked after every test in this class.
    async Task IAsyncLifetime.DisposeAsync()
    {
        var violations = await Factory.WithDbAsync(db =>
            db.Database.SqlQueryRaw<int>(ApplyHttp.InvariantSql).SingleAsync());
        Assert.Equal(0, violations);
        await base.DisposeAsync();
    }

    [Fact]
    public async Task Client_batch_with_deep_temp_chain_edits_topmost_delete_and_full_refresh()
    {
        var body = await Client.ApplyOkAsync("""
            {"edits":[{"id":11,"value":"Desktop PCs"},{"id":14,"value":"Sci-Fi"}],
             "adds":[
              {"tempId":"tmp-4","parentTempId":"tmp-3","value":"Level 4"},
              {"tempId":"tmp-3","parentTempId":"tmp-2","value":"Level 3"},
              {"tempId":"tmp-2","parentTempId":"tmp-1","value":"Level 2"},
              {"tempId":"tmp-1","parentId":2,"value":"Level 1"},
              {"tempId":"tmp-5","parentId":11,"value":"Workstations"}],
             "deletes":[10],
             "refreshIds":[1,2,4,7,10,11,14,18,26,27]}
            """);

        Assert.Equal(31, body.IdMap["tmp-1"]);
        Assert.Equal(32, body.IdMap["tmp-5"]);
        Assert.Equal(33, body.IdMap["tmp-2"]);
        Assert.Equal(34, body.IdMap["tmp-3"]);
        Assert.Equal(35, body.IdMap["tmp-4"]);
        Assert.Equal(
            new long[] { 1, 2, 4, 7, 10, 11, 14, 18, 26, 27, 31, 32, 33, 34, 35 },
            body.Nodes.Select(n => n.Id).ToArray());

        var byId = body.Nodes.ToDictionary(n => n.Id);
        foreach (var id in new long[] { 10, 18, 26, 27 })
        {
            Assert.True(byId[id].IsDeleted, $"node {id} should be deleted");
        }

        foreach (var id in new long[] { 1, 2, 4, 7, 11, 14, 31, 32, 33, 34, 35 })
        {
            Assert.False(byId[id].IsDeleted, $"node {id} should not be deleted");
        }

        Assert.Equal("Desktop PCs", byId[11].Value);
        Assert.Equal("Sci-Fi", byId[14].Value);
        Assert.Equal(new long[] { 2 }, byId[31].AncestorIds);
        Assert.True(byId[31].HasChildren);
        Assert.Equal(34, byId[35].ParentId);
        Assert.Equal(new long[] { 2, 31, 33, 34 }, byId[35].AncestorIds);
        Assert.False(byId[35].HasChildren);
        Assert.Equal(11, byId[32].ParentId);
        Assert.Equal(new long[] { 1, 4, 11 }, byId[32].AncestorIds);

        await Factory.WithDbAsync(async db =>
        {
            Assert.Equal(35, await db.Nodes.CountAsync());
            var deleted = await db.Nodes.Where(n => n.IsDeleted).Select(n => n.Id).OrderBy(id => id).ToArrayAsync();
            Assert.Equal(new long[] { 10, 18, 19, 26, 27 }, deleted);
        });
    }

    [Fact]
    public async Task Refresh_includes_nodes_deleted_by_an_earlier_apply_without_conflict()
    {
        await Client.ApplyOkAsync("""{"edits":[],"adds":[],"deletes":[18]}""");

        var body = await Client.ApplyOkAsync("""{"edits":[],"adds":[],"deletes":[4],"refreshIds":[4,10,18,26]}""");

        Assert.Equal(new long[] { 4, 10, 18, 26 }, body.Nodes.Select(n => n.Id).ToArray());
        Assert.All(body.Nodes, n => Assert.True(n.IsDeleted));
        var deleted = await Factory.WithDbAsync(db =>
            db.Nodes.Where(n => n.IsDeleted).Select(n => n.Id).OrderBy(id => id).ToArrayAsync());
        Assert.Equal(new long[] { 4, 10, 11, 18, 19, 26, 27 }, deleted);
    }

    [Fact]
    public async Task Stale_cache_changes_under_ancestor_deleted_by_another_client_are_409_and_persist_nothing()
    {
        // Another client deletes 4; its cascade reaches 18 and 26, which this client still holds as live.
        await Client.ApplyOkAsync("""{"edits":[],"adds":[],"deletes":[4]}""");

        var response = await Client.ApplyAsync("""
            {"edits":[{"id":26,"value":"x"},{"id":2,"value":"Books2"}],
             "adds":[
              {"tempId":"tmp-1","parentId":18,"value":"A"},
              {"tempId":"tmp-2","parentTempId":"tmp-1","value":"B"},
              {"tempId":"tmp-3","parentId":3,"value":"C"}],
             "deletes":[],
             "refreshIds":[2,3,18,26]}
            """);

        Assert.Equal(HttpStatusCode.Conflict, response.StatusCode);
        var (problem, ids) = await ApplyHttp.ReadProblemAsync(response);
        Assert.Equal("Conflict", problem.Title);
        Assert.Equal(new long[] { 18, 26 }, ids);
        await Factory.WithDbAsync(async db =>
        {
            Assert.Equal(30, await db.Nodes.CountAsync());
            Assert.Equal("Books", (await db.Nodes.FindAsync(2L))!.Value);
            Assert.Equal("Ultrabook 13-inch", (await db.Nodes.FindAsync(26L))!.Value);
        });
    }

    [Fact]
    public async Task Stale_delete_of_node_already_cascade_deleted_by_another_client_succeeds()
    {
        await Client.ApplyOkAsync("""{"edits":[],"adds":[],"deletes":[1]}""");

        var body = await Client.ApplyOkAsync("""
            {"edits":[{"id":2,"value":"Books2"}],"adds":[{"tempId":"tmp-1","parentId":2,"value":"New"}],"deletes":[26],"refreshIds":[2,26]}
            """);

        Assert.Equal(31, body.IdMap["tmp-1"]);
        Assert.Equal(new long[] { 2, 26, 31 }, body.Nodes.Select(n => n.Id).ToArray());
        Assert.True(body.Nodes.Single(n => n.Id == 26).IsDeleted);
        Assert.Equal("Books2", body.Nodes.Single(n => n.Id == 2).Value);
        Assert.False(body.Nodes.Single(n => n.Id == 31).IsDeleted);
    }

    [Fact]
    public async Task Real_ids_from_idMap_are_used_by_the_next_apply()
    {
        var first = await Client.ApplyOkAsync("""
            {"edits":[],"adds":[{"tempId":"tmp-1","parentId":30,"value":"A"},{"tempId":"tmp-2","parentTempId":"tmp-1","value":"B"}],"deletes":[],"refreshIds":[30]}
            """);
        Assert.Equal(31, first.IdMap["tmp-1"]);
        Assert.Equal(32, first.IdMap["tmp-2"]);

        var second = await Client.ApplyOkAsync("""
            {"edits":[{"id":31,"value":"A2"}],"adds":[{"tempId":"tmp-3","parentId":32,"value":"C"}],"deletes":[],"refreshIds":[30,31,32]}
            """);
        Assert.Equal(33, second.IdMap["tmp-3"]);
        Assert.Equal("A2", second.Nodes.Single(n => n.Id == 31).Value);
        Assert.True(second.Nodes.Single(n => n.Id == 32).HasChildren);
        Assert.Equal(new long[] { 3, 9, 17, 25, 30, 31, 32 }, second.Nodes.Single(n => n.Id == 33).AncestorIds);

        var third = await Client.ApplyOkAsync("""{"edits":[],"adds":[],"deletes":[31],"refreshIds":[30,31,32,33]}""");
        Assert.Equal(new long[] { 30, 31, 32, 33 }, third.Nodes.Select(n => n.Id).ToArray());
        Assert.False(third.Nodes.Single(n => n.Id == 30).IsDeleted);
        Assert.All(third.Nodes.Where(n => n.Id > 30), n => Assert.True(n.IsDeleted));
    }

    [Fact]
    public async Task Fifty_level_temp_chain_sent_deepest_first()
    {
        var adds = Enumerable.Range(0, 50).Reverse().Select(i => i == 0
            ? """{"tempId":"tmp-0","parentId":30,"value":"L0"}"""
            : $$"""{"tempId":"tmp-{{i}}","parentTempId":"tmp-{{i - 1}}","value":"L{{i}}"}""");

        var body = await Client.ApplyOkAsync($$"""{"edits":[],"adds":[{{string.Join(",", adds)}}],"deletes":[]}""");

        for (var i = 0; i < 50; i++)
        {
            Assert.Equal(31 + i, body.IdMap[$"tmp-{i}"]);
        }

        var deepest = body.Nodes.Single(n => n.Id == 80);
        Assert.Equal(79, deepest.ParentId);
        Assert.Equal(54, deepest.AncestorIds.Count);
        Assert.Equal(new long[] { 3, 9, 17, 25, 30, 31 }, deepest.AncestorIds.Take(6).ToArray());
        Assert.Equal(79, deepest.AncestorIds[deepest.AncestorIds.Count - 1]);
    }

    [Fact]
    public async Task RefreshIds_at_the_10000_limit_is_accepted()
    {
        var refresh = string.Join(",", Enumerable.Range(1, 10000));

        var body = await Client.ApplyOkAsync($$"""{"edits":[],"adds":[],"deletes":[1],"refreshIds":[{{refresh}}]}""");

        Assert.Equal(30, body.Nodes.Count);
        Assert.Equal(14, body.Nodes.Count(n => n.IsDeleted));
    }
}
