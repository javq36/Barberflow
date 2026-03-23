namespace BarberFlow.Infrastructure;

/// <summary>
/// Wraps the default database connection string so it can be injected
/// into services that are not registered via factory lambdas.
/// Registered as a singleton in Program.cs.
/// </summary>
public sealed class ConnectionStringAccessor
{
    public ConnectionStringAccessor(string value)
    {
        Value = value;
    }

    /// <summary>The default PostgreSQL connection string.</summary>
    public string Value { get; }
}
