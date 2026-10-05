using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc;
using TreeEditor.Api.Features.Nodes;
using TreeEditor.Api.Tests.Infrastructure;
using Xunit;

namespace TreeEditor.Api.Tests.Nodes;

[Collection(ApiCollection.Name)]
public sealed class NodeDetailsTests(ApiFactory factory) : IntegrationTestBase(factory)
{
    private async Task<NodeDetailsDto> Get(long id)
    {
        var response = await Client.GetAsync($"/api/nodes/{id}");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var dto = await response.Content.ReadFromJsonAsync<NodeDetailsDto>();
        Assert.NotNull(dto);
        return dto;
    }

    [Fact]
    public async Task Root_has_no_ancestors()
    {
        var n = await Get(1);
        Assert.Null(n.ParentId);
        Assert.Empty(n.AncestorIds);
    }

    [Fact]
    public async Task Depth_2_ancestors()
    {
        Assert.Equal(new long[] { 1 }, (await Get(4)).AncestorIds.ToArray());
    }

    [Fact]
    public async Task Depth_3_ancestors()
    {
        Assert.Equal(new long[] { 1, 4 }, (await Get(10)).AncestorIds.ToArray());
    }

    [Fact]
    public async Task Node_26_ancestors_at_depth_5()
    {
        var n = await Get(26);
        Assert.Equal(new long[] { 1, 4, 10, 18 }, n.AncestorIds.ToArray());
        Assert.Equal(18L, n.ParentId);
        Assert.Equal("Ultrabook 13-inch", n.Value);
        Assert.False(n.HasChildren);
    }

    [Fact]
    public async Task Node_28_ancestors_at_depth_5()
    {
        Assert.Equal(new long[] { 2, 7, 14, 22 }, (await Get(28)).AncestorIds.ToArray());
    }

    [Fact]
    public async Task Node_30_ancestors_last_equals_parent()
    {
        var n = await Get(30);
        Assert.Equal(new long[] { 3, 9, 17, 25 }, n.AncestorIds.ToArray());
        Assert.Equal(25L, n.ParentId);
        Assert.Equal(n.ParentId, n.AncestorIds[^1]);
    }

    [Fact]
    public async Task Node_18_has_children()
    {
        Assert.True((await Get(18)).HasChildren);
    }

    [Fact]
    public async Task Missing_node_is_404_problem()
    {
        var response = await Client.GetAsync("/api/nodes/999999");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>();
        Assert.Equal(404, problem!.Status);
    }

    [Fact]
    public async Task Non_numeric_id_is_404()
    {
        var response = await Client.GetAsync("/api/nodes/abc");
        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }
}
