using Npgsql;
using NpgsqlTypes;
using BarberFlow.Application.Helpers;

namespace BarberFlow.Infrastructure.AI;

/// <summary>
/// Resolves an inbound phone number to a barbershop identity.
/// Lookup order: customers table → users table → unknown.
/// </summary>
public sealed class BarbershopResolver
{
    private readonly string _connectionString;

    public BarbershopResolver(string connectionString)
    {
        _connectionString = connectionString;
    }

    /// <summary>
    /// Resolves the calling phone to a barbershop context.
    /// Returns (null, null, null) when the phone is not registered anywhere.
    /// </summary>
    public async Task<ResolvedIdentity> ResolveAsync(string rawPhone, CancellationToken ct)
    {
        var phone = PhoneNormalizer.Normalize(rawPhone) ?? rawPhone;

        var customer = await LookupCustomerAsync(phone, ct);
        if (customer is not null)
        {
            return customer;
        }

        var barber = await LookupBarberAsync(phone, ct);
        return barber ?? new ResolvedIdentity(null, null, null);
    }

    // ─── Lookups ──────────────────────────────────────────────────────────────

    private async Task<ResolvedIdentity?> LookupCustomerAsync(string phone, CancellationToken ct)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        await using var cmd = new NpgsqlCommand(@"
            SELECT barbershop_id, id
            FROM customers
            WHERE phone = @phone AND active = TRUE
            LIMIT 1", conn);

        cmd.Parameters.Add(new NpgsqlParameter("phone", NpgsqlDbType.Text) { Value = phone });

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct))
        {
            return null;
        }

        return new ResolvedIdentity(reader.GetGuid(0), reader.GetGuid(1), "customer");
    }

    private async Task<ResolvedIdentity?> LookupBarberAsync(string phone, CancellationToken ct)
    {
        await using var conn = new NpgsqlConnection(_connectionString);
        await conn.OpenAsync(ct);

        // role = 1 is Owner, role = 3 is Barber — check both staff roles.
        await using var cmd = new NpgsqlCommand(@"
            SELECT barbershop_id, id
            FROM users
            WHERE phone = @phone AND active = TRUE AND role IN (1, 3)
            LIMIT 1", conn);

        cmd.Parameters.Add(new NpgsqlParameter("phone", NpgsqlDbType.Text) { Value = phone });

        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct))
        {
            return null;
        }

        return new ResolvedIdentity(reader.GetGuid(0), reader.GetGuid(1), "barber");
    }
}

/// <summary>Identity resolved from an inbound phone number.</summary>
public sealed record ResolvedIdentity(
    Guid? BarbershopId,
    Guid? UserId,
    string? Role);
