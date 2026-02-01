## Provider Availability (How to think about it)

### “Availability” means

Availability is computed from the provider’s configured working hours, scheduling rules, and “busy” sources (like Google Calendar blocks and external busy calendars).

### Virtual vs in-person

- **Virtual**: Appointment slots that can be delivered virtually.
- **In-person**: Appointment slots tied to in-person availability rules.

### Practical interpretation

- “Next virtual” = the earliest available virtual slot in the requested week.
- “Next in-person” = the earliest available in-person slot in the requested week.

### Notes / constraints

- Availability can change quickly; it’s best-effort and computed live.
- Timezones matter; always include the timezone when displaying a slot.

