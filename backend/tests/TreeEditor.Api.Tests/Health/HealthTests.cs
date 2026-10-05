using System.Net;
using System.Net.Http.Json;
using TreeEditor.Api.Features.Health;
using TreeEditor.Api.Tests.Infrastructure;
using Xunit;

namespace TreeEditor.Api.Tests.Health;

[Collection(ApiCollection.Name)]
public sealed class HealthTests(ApiFactory factory) : IntegrationTestBase(factory)
{
    [Fact]
    public async Task Get_health_returns_ok()
    {
        var response = await Client.GetAsync("/api/health");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var body = await response.Content.ReadFromJsonAsync<HealthResponse>();
        Assert.NotNull(body);
        Assert.Equal("ok", body.Status);
    }
}
