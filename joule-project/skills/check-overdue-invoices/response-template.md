{% if invoices.length == 0 %}
No overdue supplier invoices found{% if companyCode %} for company code **{{ companyCode }}**{% endif %}{% if supplierId %} from **{{ supplierId }}**{% endif %}.
{% else %}
Found **{{ totalCount }} overdue invoice{% if totalCount != 1 %}s{% endif %}**{% if companyCode %} in company code **{{ companyCode }}**{% endif %}:

| Invoice | Vendor | Amount | Days Overdue |
|---------|--------|--------|--------------|
{% for inv in invoices %}| {{ inv.invoiceId }} | {{ inv.vendor }} | {{ inv.amount | currency: inv.currency }} | **{{ inv.daysOverdue }}** |
{% endfor %}

**Total outstanding:**
{% for currency, amount in totalAmountByCurrency %}
- {{ amount | currency: currency }}
{% endfor %}

Next action: reply *"pay invoice {number}"* to release payment, or *"contact vendor {id}"* to draft a follow-up email.
{% endif %}
