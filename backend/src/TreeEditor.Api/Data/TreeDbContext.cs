using Microsoft.EntityFrameworkCore;

namespace TreeEditor.Api.Data;

public sealed class TreeDbContext(DbContextOptions<TreeDbContext> options) : DbContext(options)
{
    public DbSet<Node> Nodes => Set<Node>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Node>(entity =>
        {
            entity.ToTable("nodes", table =>
            {
                table.HasCheckConstraint("ck_nodes_parent_not_self", "parent_id IS NULL OR parent_id <> id");
                table.HasCheckConstraint("ck_nodes_value_length", "char_length(value) BETWEEN 1 AND 200");
            });

            entity.HasKey(n => n.Id).HasName("pk_nodes");

            entity.Property(n => n.Id)
                .HasColumnName("id")
                .UseIdentityByDefaultColumn();

            entity.Property(n => n.ParentId)
                .HasColumnName("parent_id");

            entity.Property(n => n.Value)
                .HasColumnName("value")
                .HasMaxLength(200)
                .IsRequired();

            entity.Property(n => n.IsDeleted)
                .HasColumnName("is_deleted")
                .IsRequired();

            entity.HasOne(n => n.Parent)
                .WithMany(n => n.Children)
                .HasForeignKey(n => n.ParentId)
                .HasConstraintName("fk_nodes_parent")
                .OnDelete(DeleteBehavior.Restrict);

            entity.HasIndex(n => new { n.ParentId, n.Id })
                .HasDatabaseName("ix_nodes_parent_id_id");
        });
    }
}
