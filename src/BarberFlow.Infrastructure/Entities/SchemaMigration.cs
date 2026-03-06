using System;
using System.Collections.Generic;

namespace BarberFlow.Infrastructure.Entities;

public partial class SchemaMigration
{
    public string Version { get; set; } = null!;

    public List<string>? Statements { get; set; }

    public string? Name { get; set; }
}
