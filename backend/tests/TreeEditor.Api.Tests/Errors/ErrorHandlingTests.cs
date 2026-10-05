using System.Net;
using TreeEditor.Api.Tests.Infrastructure;
using Xunit;

namespace TreeEditor.Api.Tests.Errors;

[Collection(ApiCollection.Name)]
public sealed class ErrorHandlingTests(ApiFactory factory) : IntegrationTestBase(factory)
{
    [Fact]
    public async Task Unknown_route_returns_404_problem_json()
    {
        var response = await Client.GetAsync("/api/does-not-exist");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }
}
