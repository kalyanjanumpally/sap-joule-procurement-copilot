**{{ supplierName }}** *(ID `{{ supplierId }}`)*

{% if isBlocked %}
🛑 **Payment block active.** Downstream payments will not release until finance lifts the block.
{% endif %}

| Metric | Value |
|--------|-------|
| Open invoices | {{ openInvoiceCount }} |
{% for currency, amount in outstandingByCurrency %}| Outstanding ({{ currency }}) | {{ amount | currency: currency }} |
{% endfor %}{% if avgDaysToPay %}| Avg days to pay | {{ avgDaysToPay | round: 1 }} |
{% endif %}{% if oldestOpenDaysOverdue > 0 %}| Oldest open past-due | {{ oldestOpenDaysOverdue }} days |
{% endif %}

Reply *"show open invoices for {{ supplierId }}"* for line detail, or *"contact vendor {{ supplierId }}"* to draft a follow-up.
