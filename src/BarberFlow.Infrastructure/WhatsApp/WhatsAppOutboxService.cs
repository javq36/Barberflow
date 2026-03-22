using System.Text.Json;
using BarberFlow.Application.Services;
using BarberFlow.Domain.Enums;
using Microsoft.Extensions.Logging;
using Npgsql;
using NpgsqlTypes;

namespace BarberFlow.Infrastructure.WhatsApp;

/// <summary>
/// Raw-SQL implementation of <see cref="IWhatsAppOutboxService"/>.
/// Inserts one row into <c>whatsapp_outbox</c> with <c>status = Pending</c>.
/// Shares the caller's <see cref="NpgsqlConnection"/> (and optional transaction) to
/// guarantee at-least-once delivery inside the same DB transaction as the domain event.
/// </summary>
public sealed class WhatsAppOutboxService : IWhatsAppOutboxService
{
    private readonly ILogger<WhatsAppOutboxService> _logger;

    public WhatsAppOutboxService(ILogger<WhatsAppOutboxService> logger)
    {
        _logger = logger;
    }

    /// <inheritdoc />
    public async Task EnqueueAsync(
        NpgsqlConnection connection,
        Guid barbershopId,
        string customerPhone,
        string templateName,
        Dictionary<string, string> templateVariables,
        NpgsqlTransaction? transaction = null,
        CancellationToken ct = default)
    {
        var id = Guid.NewGuid();
        var variablesJson = JsonSerializer.Serialize(templateVariables);

        await using var cmd = new NpgsqlCommand(@"
            INSERT INTO whatsapp_outbox
                (id, barbershop_id, customer_phone, template_name, template_variables,
                 status, retry_count, max_retries, created_at, next_retry_at)
            VALUES
                (@id, @barbershopId, @customerPhone, @templateName, @templateVariables::jsonb,
                 @status, 0, 3, NOW(), NOW())", connection, transaction);

        cmd.Parameters.Add(new NpgsqlParameter("id", NpgsqlDbType.Uuid) { Value = id });
        cmd.Parameters.Add(new NpgsqlParameter("barbershopId", NpgsqlDbType.Uuid) { Value = barbershopId });
        cmd.Parameters.Add(new NpgsqlParameter("customerPhone", NpgsqlDbType.Text) { Value = customerPhone });
        cmd.Parameters.Add(new NpgsqlParameter("templateName", NpgsqlDbType.Text) { Value = templateName });
        cmd.Parameters.Add(new NpgsqlParameter("templateVariables", NpgsqlDbType.Text) { Value = variablesJson });
        cmd.Parameters.Add(new NpgsqlParameter("status", NpgsqlDbType.Integer) { Value = (int)OutboxMessageStatus.Pending });

        await cmd.ExecuteNonQueryAsync(ct);

        _logger.LogInformation(
            "WhatsApp outbox message enqueued. Id={OutboxId} Template={TemplateName} BarbershopId={BarbershopId}",
            id, templateName, barbershopId);
    }
}
