{% if error %}
Could not create the PO. S/4 said:

> {{ error.message }}

{% if error.field %}Field: `{{ error.field }}`{% endif %}
{% else %}
**Purchase order `{{ purchaseOrderId }}` created.**

| Field | Value |
|-------|-------|
| Supplier | {{ supplier }} |
| Plant | {{ items[0].plant }} |
| Material | {{ items[0].material }} — {{ items[0].description }} |
| Quantity | {{ items[0].quantity }} {{ items[0].unit }} |
| Estimated net | {{ totalNet | currency: currency }} |
| Status | Awaiting release |

Reply *"approve PO {{ purchaseOrderId }}"* to release it, or *"show PO {{ purchaseOrderId }}"* for the full document.
{% endif %}
