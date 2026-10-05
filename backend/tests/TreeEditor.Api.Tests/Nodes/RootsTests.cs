using System.Net;
using System.Net.Http.Json;
using TreeEditor.Api.Features.Nodes;
using TreeEditor.Api.Tests.Infrastructure;
using Xunit;

namespace TreeEditor.Api.Tests.Nodes;

[Collection(ApiCollection.Name)]
public sealed class RootsTests(ApiFactory factory) : IntegrationTestBase(factory)
{
    [Fact]
    public async Task Get_roots_returns_three_seed_roots_in_id_order()
    {
        var response = await Client.GetAsync("/api/nodes/roots");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var roots = await response.Content.ReadFromJsonAsync<List<NodeDto>>();
        Assert.NotNull(roots);
        Assert.Equal(new long[] { 1, 2, 3 }, roots.Select(r => r.Id).ToArray());
        Assert.Equal(new[] { "Electronics", "Books", "Home and Garden" }, roots.Select(r => r.Value).ToArray());
        Assert.All(roots, r =>
        {
            Assert.Null(r.ParentId);
            Assert.False(r.IsDeleted);
            Assert.True(r.HasChildren);
        });
    }

    [Fact]
    public async Task Get_roots_json_uses_camel_case_and_explicit_null_parent()
    {
        var json = await Client.GetStringAsync("/api/nodes/roots");

        Assert.Contains("\"id\":", json);
        Assert.Contains("\"parentId\":null", json);
        Assert.Contains("\"value\":", json);
        Assert.Contains("\"isDeleted\":", json);
        Assert.Contains("\"hasChildren\":", json);
        Assert.DoesNotContain("\"Id\":", json);
    }
}
