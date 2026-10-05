using Microsoft.EntityFrameworkCore;
using Npgsql;
using TreeEditor.Api.Tests.Infrastructure;
using Xunit;

namespace TreeEditor.Api.Tests.Data;

[Collection(ApiCollection.Name)]
public sealed class SchemaTests(ApiFactory factory) : IntegrationTestBase(factory)
{
    [Fact]
    public async Task Parent_link_is_immutable()
    {
        var ex = await Assert.ThrowsAsync<PostgresException>(() =>
            Factory.WithDbAsync(db => db.Database.ExecuteSqlRawAsync("UPDATE nodes SET parent_id = 2 WHERE id = 4")));
        Assert.Equal("23514", ex.SqlState);
    }

    [Fact]
    public async Task Updating_value_and_is_deleted_succeeds()
    {
        var rows = await Factory.WithDbAsync(db =>
            db.Database.ExecuteSqlRawAsync("UPDATE nodes SET value = 'v', is_deleted = TRUE WHERE id = 4"));
        Assert.Equal(1, rows);
    }

    [Fact]
    public async Task Self_parent_is_rejected()
    {
        var ex = await Assert.ThrowsAsync<PostgresException>(() =>
            Factory.WithDbAsync(db => db.Database.ExecuteSqlRawAsync(
                "INSERT INTO nodes (id, parent_id, value, is_deleted) VALUES (100, 100, 'self', FALSE)")));
        Assert.Equal("23514", ex.SqlState);
    }

    [Fact]
    public async Task Unknown_parent_is_rejected()
    {
        var ex = await Assert.ThrowsAsync<PostgresException>(() =>
            Factory.WithDbAsync(db => db.Database.ExecuteSqlRawAsync(
                "INSERT INTO nodes (id, parent_id, value, is_deleted) VALUES (101, 999999, 'orphan', FALSE)")));
        Assert.Equal("23503", ex.SqlState);
    }
}
