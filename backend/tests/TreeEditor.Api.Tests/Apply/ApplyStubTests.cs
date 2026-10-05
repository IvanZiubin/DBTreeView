using System.Net;
using System.Net.Http.Json;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using TreeEditor.Api.Tests.Infrastructure;
using Xunit;

namespace TreeEditor.Api.Tests.Apply;

[Collection(ApiCollection.Name)]
public sealed class ApplyStubTests(ApiFactory factory) : IntegrationTestBase(factory)
{
    [Fact]
    public async Task Apply_with_body_returns_501_problem()
    {
        var content = new StringContent("{\"edits\":[],\"adds\":[],\"deletes\":[]}", Encoding.UTF8, "application/json");

        var response = await Client.PostAsync("/api/nodes/apply", content);

        Assert.Equal(HttpStatusCode.NotImplemented, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
        var problem = await response.Content.ReadFromJsonAsync<ProblemDetails>();
        Assert.NotNull(problem);
        Assert.Equal(501, problem.Status);
        Assert.Equal("Not Implemented", problem.Title);
    }

    [Fact]
    public async Task Apply_without_body_returns_501()
    {
        var response = await Client.PostAsync("/api/nodes/apply", null);
        Assert.Equal(HttpStatusCode.NotImplemented, response.StatusCode);
    }
}
