using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace TreeEditor.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "nodes",
                columns: table => new
                {
                    id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    parent_id = table.Column<long>(type: "bigint", nullable: true),
                    value = table.Column<string>(type: "character varying(200)", maxLength: 200, nullable: false),
                    is_deleted = table.Column<bool>(type: "boolean", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("pk_nodes", x => x.id);
                    table.CheckConstraint("ck_nodes_parent_not_self", "parent_id IS NULL OR parent_id <> id");
                    table.CheckConstraint("ck_nodes_value_length", "char_length(value) BETWEEN 1 AND 200");
                    table.ForeignKey(
                        name: "fk_nodes_parent",
                        column: x => x.parent_id,
                        principalTable: "nodes",
                        principalColumn: "id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateIndex(
                name: "ix_nodes_parent_id_id",
                table: "nodes",
                columns: new[] { "parent_id", "id" });

            migrationBuilder.Sql("""
                CREATE FUNCTION nodes_parent_immutable() RETURNS trigger
                LANGUAGE plpgsql AS $$
                BEGIN
                    IF NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN
                        RAISE EXCEPTION 'nodes.parent_id is immutable (node %)', OLD.id
                            USING ERRCODE = 'check_violation';
                    END IF;
                    RETURN NEW;
                END;
                $$;
                """);

            migrationBuilder.Sql("""
                CREATE TRIGGER trg_nodes_parent_immutable
                BEFORE UPDATE OF parent_id ON nodes
                FOR EACH ROW EXECUTE FUNCTION nodes_parent_immutable();
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("DROP TRIGGER IF EXISTS trg_nodes_parent_immutable ON nodes;");
            migrationBuilder.Sql("DROP FUNCTION IF EXISTS nodes_parent_immutable();");

            migrationBuilder.DropTable(
                name: "nodes");
        }
    }
}
