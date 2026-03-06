using Microsoft.EntityFrameworkCore;

namespace BarberFlow.Infrastructure
{
    public class BarberFlowDbContext : DbContext
    {
        public BarberFlowDbContext(DbContextOptions<BarberFlowDbContext> options)
            : base(options)
        {
        }

        // Ejemplo de DbSet, agrega los tuyos según tus entidades
        // public DbSet<User> Users { get; set; }
    }
}
