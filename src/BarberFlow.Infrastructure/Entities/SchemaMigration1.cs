using System;
using System.Collections.Generic;

namespace BarberFlow.Infrastructure.Entities;

/// <summary>
/// Auth: Manages updates to the auth system.
/// </summary>
public partial class SchemaMigration1
{
    public string Version { get; set; } = null!;
}
