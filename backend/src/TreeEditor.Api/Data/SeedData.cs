namespace TreeEditor.Api.Data;

public sealed record SeedNode(long Id, long? ParentId, string Value);

public static class SeedData
{
    public static readonly IReadOnlyList<SeedNode> Nodes = new SeedNode[]
    {
        new(1, null, "Electronics"),
        new(2, null, "Books"),
        new(3, null, "Home and Garden"),
        new(4, 1, "Computers"),
        new(5, 1, "Phones"),
        new(6, 1, "Audio"),
        new(7, 2, "Fiction"),
        new(8, 2, "Non-fiction"),
        new(9, 3, "Furniture"),
        new(10, 4, "Laptops"),
        new(11, 4, "Desktops"),
        new(12, 5, "Smartphones"),
        new(13, 6, "Headphones"),
        new(14, 7, "Science Fiction"),
        new(15, 7, "Mystery"),
        new(16, 8, "History"),
        new(17, 9, "Chairs"),
        new(18, 10, "Ultrabooks"),
        new(19, 10, "Gaming Laptops"),
        new(20, 12, "Android"),
        new(21, 12, "iOS"),
        new(22, 14, "Space Opera"),
        new(23, 14, "Cyberpunk"),
        new(24, 16, "Ancient History"),
        new(25, 17, "Office Chairs"),
        new(26, 18, "Ultrabook 13-inch"),
        new(27, 18, "Ultrabook 15-inch"),
        new(28, 22, "Foundation Series"),
        new(29, 23, "Neuromancer"),
        new(30, 25, "Ergonomic Mesh Chair"),
    };
}
