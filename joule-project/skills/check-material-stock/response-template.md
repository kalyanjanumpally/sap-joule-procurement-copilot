{% if byLocation.length == 0 %}
Material `{{ material }}` is not on hand{% if plant %} in plant **{{ plant }}**{% endif %}.
{% else %}
**{{ material }}** — {{ totalQuantity }} {{ unit }} on hand{% if plant %} in plant **{{ plant }}**{% else %} across {{ byLocation.length }} location{% if byLocation.length != 1 %}s{% endif %}{% endif %}.

{% if belowReorder %}
⚠️ **Below reorder point** ({{ reorderPoint }} {{ unit }}). Reply *"create PO for {{ material }}"* to trigger replenishment.
{% endif %}

{% if byLocation.length > 1 %}
| Plant | Storage Location | Quantity |
|-------|------------------|----------|
{% for row in byLocation %}| {{ row.plant }} | {{ row.storageLocation }} | {{ row.quantity }} {{ unit }} |
{% endfor %}
{% endif %}
{% endif %}
