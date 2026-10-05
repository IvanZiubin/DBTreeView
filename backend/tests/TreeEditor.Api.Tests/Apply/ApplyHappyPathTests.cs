using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using TreeEditor.Api.Features.Nodes;
using TreeEditor.Api.Tests.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace TreeEditor.Api.Tests.Apply;

[Collection(ApiCollection.Name)]
public sealed class ApplyHappyPathTests(ApiFactory factory) : IntegrationTestBase(factory)
{
    [Fact]
    public async Task Empty_request_returns_empty_body()
    {
        var response = await Client.ApplyAsync(ApplyHttp.EmptyRequest);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("""{"idMap":{},"nodes":[]}""", await response.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task RefreshIds_only_ignores_missing_and_duplicates()
    {
        var body = await Client.ApplyOkAsync("""{"edits":[],"adds":[],"deletes":[],"refreshIds":[3,999999,3]}""");

        Assert.Empty(body.IdMap);
        var node = Assert.Single(body.Nodes);
        Assert.Equal(3, node.Id);
        Assert.Equal("Home and Garden", node.Value);
        await Factory.WithDbAsync(async db => Assert.Equal(30, await db.Nodes.CountAsync()));
    }

    [Fact]
    public async Task Edit_trims_value()
    {
        var body = await Client.ApplyOkAsync("""{"edits":[{"id":11,"value":"  Desktop PCs  "}],"adds":[],"deletes":[]}""");

        Assert.Equal("Desktop PCs", body.Nodes[0].Value);
        var node = await Client.GetFromJsonAsync<NodeDetailsDto>("/api/nodes/11");
        Assert.Equal("Desktop PCs", node!.Value);
    }

    [Fact]
    public async Task Add_under_real_parent()
    {
        var body = await Client.ApplyOkAsync("""{"edits":[],"adds":[{"tempId":"tmp-1","parentId":30,"value":"New"}],"deletes":[]}""");

        Assert.Equal(31, body.IdMap["tmp-1"]);
        var node = Assert.Single(body.Nodes);
        Assert.Equal(31, node.Id);
        Assert.Equal(30, node.ParentId);
        Assert.Equal(new long[] { 3, 9, 17, 25, 30 }, node.AncestorIds);
        Assert.False(node.HasChildren);
        Assert.False(node.IsDeleted);
    }

    [Fact]
    public async Task Temp_id_chain_with_reversed_request_order()
    {
        var body = await Client.ApplyOkAsync("""
            {"edits":[],"adds":[
              {"tempId":"tmp-2","parentTempId":"tmp-1","value":"Grandchild"},
              {"tempId":"tmp-1","parentId":11,"value":"Child"}],"deletes":[]}
            """);

        Assert.Equal(31, body.IdMap["tmp-1"]);
        Assert.Equal(32, body.IdMap["tmp-2"]);
        var n32 = body.Nodes.Single(n => n.Id == 32);
        Assert.Equal(new long[] { 1, 4, 11, 31 }, n32.AncestorIds);
        Assert.True(body.Nodes.Single(n => n.Id == 31).HasChildren);
    }

    [Fact]
    public async Task Three_level_chain_plus_sibling_uses_breadth_first_ids()
    {
        var body = await Client.ApplyOkAsync("""
            {"edits":[],"adds":[
              {"tempId":"a","parentId":2,"value":"A"},
              {"tempId":"b","parentTempId":"a","value":"B"},
              {"tempId":"c","parentTempId":"b","value":"C"},
              {"tempId":"d","parentId":3,"value":"D"}],"deletes":[]}
            """);

        Assert.Equal(31, body.IdMap["a"]);
        Assert.Equal(32, body.IdMap["d"]);
        Assert.Equal(33, body.IdMap["b"]);
        Assert.Equal(34, body.IdMap["c"]);
        foreach (var n in body.Nodes.Where(n => n.ParentId is > 30))
        {
            Assert.True(n.Id > n.ParentId);
        }
    }

    [Fact]
    public async Task Response_contains_all_referenced_ids_deduplicated_and_ordered()
    {
        var body = await Client.ApplyOkAsync("""
            {"edits":[{"id":5,"value":"P"}],"adds":[{"tempId":"t","parentId":2,"value":"T"}],"deletes":[27],"refreshIds":[27,1,5]}
            """);

        Assert.Equal(new long[] { 1, 5, 27, 31 }, body.Nodes.Select(n => n.Id).ToArray());
    }

    [Fact]
    public async Task Mixed_batch_persists()
    {
        await Client.ApplyOkAsync("""
            {"edits":[{"id":2,"value":"Books2"}],"adds":[{"tempId":"t","parentId":3,"value":"Added"}],"deletes":[7]}
            """);

        var n2 = await Client.GetFromJsonAsync<NodeDetailsDto>("/api/nodes/2");
        var n31 = await Client.GetFromJsonAsync<NodeDetailsDto>("/api/nodes/31");
        var n7 = await Client.GetFromJsonAsync<NodeDetailsDto>("/api/nodes/7");
        Assert.Equal("Books2", n2!.Value);
        Assert.Equal("Added", n31!.Value);
        Assert.True(n7!.IsDeleted);
    }

    [Fact]
    public async Task Response_json_is_camel_case()
    {
        var response = await Client.ApplyAsync("""{"edits":[],"adds":[{"tempId":"t","parentId":3,"value":"x"}],"deletes":[]}""");
        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());

        var root = doc.RootElement;
        Assert.True(root.TryGetProperty("idMap", out _));
        var node = root.GetProperty("nodes")[0];
        foreach (var name in new[] { "id", "parentId", "value", "isDeleted", "hasChildren", "ancestorIds" })
        {
            Assert.True(node.TryGetProperty(name, out _), name);
        }
    }
}
