# WealthHouse Grocery Taxonomy

This document defines the canonical grocery item groups used for receipt intelligence, price history, and reorder prediction.

## Grocery Taxonomy

| Canonical Item Name | Aliases | Taxonomy Group | Taxonomy Subgroup |
| --- | --- | --- | --- |
| milk | fresh milk, full cream milk, low fat milk, uht milk | Dairy | Milk |
| yogurt | yoghurt, greek yogurt, greek yoghurt | Dairy | Yogurt |
| cheese | cheddar, mozzarella, parmesan | Dairy | Cheese |
| eggs | egg, cage free eggs | Dairy | Eggs |
| bread | loaf, sourdough, baguette, wholemeal bread | Bakery | Bread |
| rice | jasmine rice, basmati rice, brown rice | Pantry | Rice |
| noodles | instant noodles, pasta, spaghetti | Pantry | Noodles |
| oil | cooking oil, olive oil, vegetable oil | Pantry | Cooking Oil |
| sugar | caster sugar, brown sugar | Pantry | Sugar |
| salt | sea salt, table salt | Pantry | Seasoning |
| chicken | chicken breast, chicken thigh, whole chicken | Protein | Poultry |
| beef | minced beef, steak, beef slices | Protein | Beef |
| fish | salmon, cod, seabass | Protein | Seafood |
| apples | apple, gala apple, fuji apple | Produce | Fruit |
| bananas | banana | Produce | Fruit |
| oranges | orange, mandarin, clementine | Produce | Fruit |
| spinach | baby spinach, spinach leaves | Produce | Leafy Greens |
| tomatoes | tomato, cherry tomatoes | Produce | Vegetables |
| onions | onion, red onion, yellow onion | Produce | Vegetables |
| potatoes | potato, baby potato | Produce | Vegetables |
| detergent | laundry detergent, dish soap, floor cleaner | Household | Cleaning |
| tissue | toilet paper, kitchen towel, facial tissue | Household | Paper Goods |
| diapers | nappy, baby diaper | Baby | Essentials |

## Grocery Intelligence Rules

- Normalize item text to lowercase and remove pack-size noise where possible.
- Match by alias before falling back to fuzzy word overlap.
- When no explicit taxonomy match is found, keep the normalized item name and assign:
  - `taxonomy_group = Misc Grocery`
  - `taxonomy_subgroup = Unclassified`
- Grocery purchase history should update:
  - price history
  - purchase frequency
  - average interval between purchases
  - reorder prediction
