using Npgsql;

namespace BarberFlow.Application.Services;

/// <summary>
/// Writes outbound WhatsApp messages to the <c>whatsapp_outbox</c> table.
/// Callers pass their open <see cref="NpgsqlConnection"/> (and optional transaction)
/// so the insert is atomic with the triggering domain operation.
/// </summary>
/// <remarks>
/// <b>Architecture tradeoff</b>: This interface exposes <see cref="NpgsqlConnection"/>
/// and <see cref="NpgsqlTransaction"/> directly in the Application layer, which technically
/// violates Clean Architecture by leaking persistence details into the contract.
/// <br/>
/// This is a <b>deliberate, consistent decision</b> for this project: the entire Application
/// layer already uses raw Npgsql (e.g., <see cref="BookingService"/> — see its constructor
/// and all private SQL helpers), so there is no abstraction boundary to preserve here.
/// Using <see cref="NpgsqlConnection"/> in this interface is <em>consistent</em> with the
/// existing pattern, not an exception to it.
/// <br/>
/// The concrete callers (<see cref="BookingService"/>, <c>AppointmentReminderService</c>)
/// pass their own open connection so the outbox INSERT is atomic with the domain event INSERT —
/// this is the core requirement of the outbox pattern. A unit-of-work abstraction would be
/// the clean-architecture alternative, but adds complexity with no benefit given the existing
/// Npgsql-first approach.
/// </remarks>
public interface IWhatsAppOutboxService
{
    /// <summary>
    /// Inserts a new outbox row with <c>status = Pending</c>.
    /// The caller is responsible for committing (or rolling back) the transaction.
    /// </summary>
    /// <param name="connection">Open Npgsql connection to reuse.</param>
    /// <param name="barbershopId">Tenant scope — ensures multi-tenant isolation.</param>
    /// <param name="customerPhone">Destination phone in E.164 format.</param>
    /// <param name="templateName">Canonical template name (see <see cref="BarberFlow.Domain.Enums.WhatsAppTemplateName"/>).</param>
    /// <param name="templateVariables">Variables injected into the Twilio template.</param>
    /// <param name="transaction">Optional transaction shared with the calling service.</param>
    /// <param name="ct">Cancellation token.</param>
    Task EnqueueAsync(
        NpgsqlConnection connection,
        Guid barbershopId,
        string customerPhone,
        string templateName,
        Dictionary<string, string> templateVariables,
        NpgsqlTransaction? transaction = null,
        CancellationToken ct = default);
}
