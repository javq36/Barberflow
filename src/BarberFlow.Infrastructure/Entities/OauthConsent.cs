using System;
using System.Collections.Generic;

namespace BarberFlow.Infrastructure.Entities;

public partial class OauthConsent
{
    public Guid Id { get; set; }

    public Guid UserId { get; set; }

    public Guid ClientId { get; set; }

    public string Scopes { get; set; } = null!;

    public DateTime GrantedAt { get; set; }

    public DateTime? RevokedAt { get; set; }

    public virtual OauthClient Client { get; set; } = null!;

    public virtual User User { get; set; } = null!;
}
