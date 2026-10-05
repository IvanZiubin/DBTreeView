using System.Net;
using System.Net.Http.Json;
using Microsoft.EntityFrameworkCore;
using TreeEditor.Api.Features.Nodes;
using TreeEditor.Api.Tests.Infrastructure;
using Xunit;

namespace TreeEditor.Api.Tests.Apply;

[Collection(ApiCollection.Name)]
public sealed class ApplyCascadeTests(ApiFactory factory) : IntegrationTestBase(factory), IAsyncLifetime
{
    private static readonly long[] Subtree1 = { 1, 4, 5, 6, 10, 11, 12, 13, 18, 19, 20, 21, 26, 27 };

    // Re-implements IAsyncLifetime so the invariant is checked after every test in this class.
    async Task IAsyncLifetime.DisposeAsync()
    {
        await AssertInvariantAsync();
        await base.DisposeAsync();
    }

    private async Task AssertInvariantAsync()
    {
        var violations = await Factory.WithDbAsync(db =>
            db.Database.SqlQueryRaw<int>(ApplyHttp.InvariantSql).SingleAsync());
        Assert.Equal(0, violations);
    }

    [Fact]
    public async Task Delete_cascades_to_never_loaded_descendants()
    {
        await Client.ApplyOkAsync("""{"edits":[],"adds":[],"deletes":[1]}""");

        await Factory.WithDbAsync(async db =>
        {
            var rows = await db.Nodes.AsNoTracking().ToListAsync();
            Assert.All(rows.Where(r => Subtree1.Contains(r.Id)), r => Assert.True(r.IsDeleted));
            Assert.All(rows.Where(r => !Subtree1.Contains(r.Id)), r => Assert.False(r.IsDeleted));
        });
        var n26 = await Client.GetFromJsonAsync<NodeDetailsDto>("/api/nodes/26");
        Assert.True(n26!.IsDeleted);
    }

    [Fact]
    public async Task RefreshIds_show_cascade()
    {
        var body = await Client.ApplyOkAsync("""{"edits":[],"adds":[],"deletes":[1],"refreshIds":[26,27,2]}""");

        Assert.Equal(new long[] { 1, 2, 26, 27 }, body.Nodes.Select(n => n.Id).ToArray());
        Assert.True(body.Nodes.Single(n => n.Id == 26).IsDeleted);
        Assert.True(body.Nodes.Single(n => n.Id == 27).IsDeleted);
        Assert.False(body.Nodes.Single(n => n.Id == 2).IsDeleted);
    }

    [Fact]
    public async Task Cascade_covers_nodes_added_in_earlier_apply()
    {
        var first = await Client.ApplyOkAsync("""{"edits":[],"adds":[{"tempId":"t","parentId":26,"value":"x"}],"deletes":[]}""");
        Assert.Equal(31, first.IdMap["t"]);

        var second = await Client.ApplyOkAsync("""{"edits":[],"adds":[],"deletes":[4],"refreshIds":[31]}""");

        Assert.True(second.Nodes.Single(n => n.Id == 31).IsDeleted);
    }

    [Fact]
    public async Task Same_batch_add_under_node_deleted_in_batch_is_deleted()
    {
        var body = await Client.ApplyOkAsync("""
            {"edits":[],"adds":[{"tempId":"t1","parentId":10,"value":"a"},{"tempId":"t2","parentTempId":"t1","value":"b"}],"deletes":[4]}
            """);

        Assert.True(body.IdMap.ContainsKey("t1"));
        Assert.True(body.IdMap.ContainsKey("t2"));
        Assert.All(body.Nodes.Where(n => body.IdMap.Values.Contains(n.Id)), n => Assert.True(n.IsDeleted));
    }

    [Fact]
    public async Task Same_batch_edit_of_descendant_of_deleted_node()
    {
        var body = await Client.ApplyOkAsync("""{"edits":[{"id":26,"value":"x"}],"adds":[],"deletes":[10]}""");

        var n26 = body.Nodes.Single(n => n.Id == 26);
        Assert.Equal("x", n26.Value);
        Assert.True(n26.IsDeleted);
    }

    [Fact]
    public async Task Redelete_is_idempotent()
    {
        await Client.ApplyOkAsync("""{"edits":[],"adds":[],"deletes":[1]}""");
        var second = await Client.ApplyOkAsync("""{"edits":[],"adds":[],"deletes":[1,1,26]}""");

        Assert.Equal(new long[] { 1, 26 }, second.Nodes.Select(n => n.Id).ToArray());
        Assert.All(second.Nodes, n => Assert.True(n.IsDeleted));
        var count = await Factory.WithDbAsync(db => db.Nodes.CountAsync(n => n.IsDeleted));
        Assert.Equal(14, count);
    }

    [Fact]
    public async Task Duplicate_delete_ids_are_deduplicated()
    {
        var response = await Client.ApplyAsync("""{"edits":[],"adds":[],"deletes":[5,5]}""");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<TreeEditor.Api.Features.Apply.ApplyResponse>();
        Assert.Equal(new long[] { 5 }, body!.Nodes.Select(n => n.Id).ToArray());
    }
}
