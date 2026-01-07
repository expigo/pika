# Pika! Development Roadmap 2026

```
                    Q1 2026                          Q2 2026                          Q3 2026
    ┌────────────────────────────────────┬────────────────────────────────────┬────────────────────────────────┐
    │                                    │                                    │                                │
    │  ╔══════════════════════════════╗  │  ╔══════════════════════════════╗  │  ╔════════════════════════════╗│
    │  ║  PHASE 0: MVP ✅ COMPLETE    ║  │  ║  PHASE 2: ACCOUNTS           ║  │  ║  PHASE 3: ORGANIZATIONS   ║│
    │  ╠══════════════════════════════╣  │  ╠══════════════════════════════╣  │  ╠════════════════════════════╣│
    │  ║ ✅ Live sessions             ║  │  ║ ⬜ Auth.js setup             ║  │  ║ ⬜ Dance school profiles   ║│
    │  ║ ✅ Likes & tempo feedback    ║  │  ║ ⬜ User registration         ║  │  ║ ⬜ Event management        ║│
    │  ║ ✅ Polls with timer          ║  │  ║ ⬜ Role-based access         ║  │  ║ ⬜ DJ booking system       ║│
    │  ║ ✅ Session analytics         ║  │  ║ ⬜ DJ profiles               ║  │  ║ ⬜ Student management      ║│
    │  ║ ✅ Desktop DJ app            ║  │  ║ ⬜ Desktop app login         ║  │  ║ ⬜ Multi-DJ events         ║│
    │  ╚══════════════════════════════╝  │  ╚══════════════════════════════╝  │  ╚════════════════════════════╝│
    │                                    │                                    │                                │
    │  ╔══════════════════════════════╗  │  ╔══════════════════════════════╗  │  ╔════════════════════════════╗│
    │  ║  PHASE 1: SECURITY 🔒       ║  │  ║  PHASE 4: PRODUCTION         ║  │  ║  PHASE 5: SCALE           ║│
    │  ╠══════════════════════════════╣  │  ╠══════════════════════════════╣  │  ╠════════════════════════════╣│
    │  ║ 🔴 DJ authentication        ║  │  ║ 🟡 VPS deployment            ║  │  ║ ⬜ Redis cluster           ║│
    │  ║ 🟠 Input sanitization       ║  │  ║ 🟡 Redis hot state           ║  │  ║ ⬜ Horizontal scaling      ║│
    │  ║ 🟠 Message size limits      ║  │  ║ 🟡 CI/CD pipeline            ║  │  ║ ⬜ CDN for assets          ║│
    │  ║ 🟡 Connection rate limits   ║  │  ║ 🟡 Monitoring                ║  │  ║ ⬜ Mobile PWA              ║│
    │  ║ 🟡 Fix likesSent scope      ║  │  ║ 🟡 Automated backups         ║  │  ║ ⬜ API rate limiting       ║│
    │  ╚══════════════════════════════╝  │  ╚══════════════════════════════╝  │  ╚════════════════════════════╝│
    │                                    │                                    │                                │
    │   January      February   March    │   April        May        June     │   July      August   September │
    └────────────────────────────────────┴────────────────────────────────────┴────────────────────────────────┘

    Legend: ✅ Done   🔴 Critical   🟠 High   🟡 Medium   ⬜ Planned
```

## Milestone Timeline

### 🎯 M1: Production Ready (End of January)
- [ ] Security hardening complete
- [ ] VPS deployed with HTTPS
- [ ] Basic monitoring in place
- [ ] First real event usage

### 🎯 M2: Account System (End of March)
- [ ] User registration/login working
- [ ] DJ profiles with custom URLs
- [ ] Desktop app authenticated
- [ ] Dancer "My Likes" linked to account

### 🎯 M3: Organizations (End of June)
- [ ] Dance schools can register
- [ ] Events can be created/managed
- [ ] DJs can be invited to events
- [ ] Event-specific analytics

### 🎯 M4: Scale Ready (End of September)
- [ ] Handle 1000+ concurrent users
- [ ] Multi-server deployment ready
- [ ] Mobile PWA launched
- [ ] Premium features defined

---

## Priority Matrix

```
                    HIGH IMPACT
                        │
    ┌───────────────────┼───────────────────┐
    │                   │                   │
    │   DO FIRST        │   SCHEDULE        │
    │                   │                   │
    │ • DJ Auth         │ • Account System  │
    │ • VPS Deploy      │ • Organizations   │
    │ • Security Fixes  │ • Mobile PWA      │
    │                   │                   │
LOW ├───────────────────┼───────────────────┤ HIGH
EFFORT                  │                   EFFORT
    │                   │                   │
    │   QUICK WINS      │   CONSIDER        │
    │                   │                   │
    │ • Message Limits  │ • Redis Migration │
    │ • Input Sanitize  │ • Native App      │
    │ • Fix likesSent   │ • API v2          │
    │                   │                   │
    └───────────────────┼───────────────────┘
                        │
                    LOW IMPACT
```

---

## Resource Requirements

| Phase | Effort | Team Size | Duration |
|-------|--------|-----------|----------|
| Phase 1: Security | 40 hours | 1 dev | 2 weeks |
| Phase 2: Accounts | 160 hours | 1-2 devs | 6 weeks |
| Phase 3: Orgs | 200 hours | 2 devs | 8 weeks |
| Phase 4: Production | 80 hours | 1 dev | 3 weeks |
| Phase 5: Scale | 120 hours | 2 devs | 6 weeks |

---

## Risk Assessment

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Security breach | 🔴 High | Medium | Phase 1 priority |
| Data loss | 🔴 High | Low | Turso + backups |
| VPS limits | 🟠 Medium | Medium | Monitor usage |
| OAuth setup delays | 🟡 Low | Medium | Start with email |
| Desktop auth complexity | 🟡 Low | High | Use popup flow |

---

## Success Metrics

### Phase 1-2 (Q1)
- [ ] 0 security incidents
- [ ] 99% uptime
- [ ] 100+ registered DJs
- [ ] 1000+ registered dancers

### Phase 3-4 (Q2)
- [ ] 10+ dance schools
- [ ] 50+ events managed
- [ ] 5000+ active dancers
- [ ] <100ms WebSocket latency

### Phase 5 (Q3)
- [ ] 1000+ concurrent connections
- [ ] Multi-region availability
- [ ] Revenue from premium tiers
