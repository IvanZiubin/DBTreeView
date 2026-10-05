using System.Net;
using System.Net.Http.Json;
using Microsoft.AspNetCore.Mvc;
using TreeEditor.Api.Data;
using TreeEditor.Api.Features.Nodes;
using TreeEditor.Api.Tests.Infrastructure;
using Xunit;

namespace TreeEditor.Api.Tests.Nodes;

[Collection(ApiCollection.Name)]
public sealed class ChildrenTests(ApiFactory factory) : IntegrationTestBase(factory)
{
    private async Task<List<NodeDto>> GetChildren(long id)
    {
        var response = await Client.GetAsync($"/api/nodes/{id}/children");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var list = await response.Content.ReadFromJsonAsync<List<NodeDto>>();
        Assert.NotNull(list);
        return list;
    }

    [Fact]
    public async Task Children_of_node_1_are_4_5_6()
    {
        var children = await GetChildren(1);

        Assert.Equal(new long[] { 4, 5, 6 }, children.Select(c => c.Id).ToArray());
        Assert.All(children, c => Assert.Equal(1L, c.ParentId));
    }

    [Fact]
    public async Task Children_of_node_4_report_has_children_flags()
    {
        var children = await GetChildren(4);

        Assert.Equal(new long[] { 10, 11 }, children.Select(c => c.Id).ToArray());
        Assert.True(children.Single(c => c.Id == 10).HasChildren);
        Assert.False(children.Single(c => c.Id == 11).HasChildren);
    }

    [Fact]
    public async Task Children_of_leaf_is_empty_array()
    {
        var response = await Client.GetAsync("/api/nodes/11/children");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        Assert.Equal("[]", (await response.Content.ReadAsStringAsync()).Trim());
    }

    [Fact]
    public async Task Has_children_counts_deleted_children()
    {
        await Factory.WithDbAsync(async db =>
        {
            db.Nodes.Add(new Node { ParentId = 11, Value = "x", IsDeleted = true });
            await db.SaveChangesAsync();
        });

        var children = await GetChildren(4);

        Assert.True(children.Single(c => c.Id == 11).HasChildren);
    }

    [Fact]
    public async Task Deleted_nodes_are_still_returned()
    {
        await Factory.WithDbAsync(async db =>
        {
            var node = await db.Nodes.FindAsync(10L);
            node!.IsDeleted = true;
            await db.SaveChangesAsync();
        });

        var children = await GetChildren(4);

        var n10 = Assert.Single(children, c => c.Id == 10);
        Assert.True(n10.IsDeleted);
    }

    [Fact]
    public async Task Children_of_missing_node_is_404_problem()
    {
        var response = await Client.GetAsync("/api/nodes/999999/children");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>();
        Assert.NotNull(problem);
        Assert.Equal(404, problem.Status);
        Assert.Equal("Not Found", problem.Title);
    }
}
