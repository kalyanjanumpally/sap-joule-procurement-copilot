{% if released %}
✅ **PO `{{ purchaseOrderId }}` released** with code `{{ releaseCode }}`.

| Field | Value |
|-------|-------|
| Supplier | {{ supplier }} |
| Net value | {{ totalNet | currency: currency }} |
| Released by | {{ user.displayName }} |
| Released at | {{ now | date: "yyyy-MM-dd HH:mm" }} |

The PO is now transmitted to the supplier via the configured output channel.
{% elsif awaitingConfirmation %}
**PO `{{ purchaseOrderId }}` — awaiting your approval**

| Field | Value |
|-------|-------|
| Supplier | {{ supplier }} |
| Total net | {{ totalNet | currency: currency }} |
| Items | {{ items.length }} |
| Release code | {{ releaseCode }} |

Reply **yes** to release, **cancel** to abort.
{% else %}
Could not release PO `{{ purchaseOrderId }}`: {{ error.message }}
{% endif %}
