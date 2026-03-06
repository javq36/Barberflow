using System;
using System.Collections.Generic;

namespace BarberFlow.Infrastructure.Entities;

public partial class SchemaMigration2
{
    public long Version { get; set; }

    public DateTime? InsertedAt { get; set; }
}
