using Xunit;

namespace TreeEditor.Api.Tests.Infrastructure;

/// <summary>
/// Base for integration tests. Resets the database to the seed before every test.
/// Every derived class MUST carry [Collection(ApiCollection.Name)] itself.
/// </summary>
public abstract class IntegrationTestBase : IAsyncLifetime
{
    protected IntegrationTestBase(ApiFactory factory)
    {
        Factory = factory;
        Client = factory.CreateClient();
    }

    protected ApiFactory Factory { get; }

    protected HttpClient Client { get; }

    public Task InitializeAsync() => Factory.ResetDatabaseAsync();

    public Task DisposeAsync()
    {
        Client.Dispose();
        return Task.CompletedTask;
    }
}
