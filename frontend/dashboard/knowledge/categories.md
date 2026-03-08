Overview

This file defines the official transaction categories used in the WealthHouse financial tracking system.

Rules:
	•	Every transaction must belong to exactly one category.
	•	Categories should remain stable over time to ensure accurate reporting.
	•	Merchant-to-category mappings should reference only these categories.
	•	If a merchant has already been classified once, the system should reuse the same category without re-running classification.

⸻

Primary Categories

1. Groceries

Purchases of food or household consumables meant for home use.

Examples:
	•	Supermarket purchases
	•	Fresh produce
	•	Meat, fish, dairy
	•	Fruits and vegetables
	•	Rice, noodles, grains
	•	Cooking ingredients
	•	Bread, eggs, milk
	•	Snacks for home
	•	Household pantry items

Example Merchants:
	•	NTUC FairPrice
	•	Sheng Siong
	•	Giant
	•	Cold Storage
	•	Don Don Donki
	•	Mustafa

⸻

2. Eating Out

Food and beverages consumed outside the home.

Examples:
	•	Hawker centre meals
	•	Restaurant dining
	•	Cafes
	•	Coffee shops
	•	Bubble tea
	•	GrabFood / Deliveroo orders

Example Merchants:
	•	Hawker Centre stalls
	•	McDonald’s
	•	Starbucks
	•	Kopitiam
	•	Toast Box
	•	Food courts

⸻

3. General Household

Non-food items used for household maintenance or daily living.

Examples:
	•	Cleaning supplies
	•	Laundry detergent
	•	Dishwashing liquid
	•	Paper towels
	•	Toilet paper
	•	Trash bags
	•	Basic kitchen supplies

Example Merchants:
	•	Daiso
	•	FairPrice household section
	•	Mr DIY

⸻

4. Transport

Costs related to moving from one place to another.

Examples:
	•	MRT
	•	Bus
	•	Taxi
	•	Grab rides
	•	Parking
	•	Fuel

Example Merchants:
	•	Grab
	•	ComfortDelGro
	•	Shell
	•	Esso
	•	TransitLink

⸻

5. Shopping

Non-essential or discretionary purchases.

Examples:
	•	Clothing
	•	Electronics
	•	Gadgets
	•	Gifts
	•	Personal items
	•	Online shopping

Example Merchants:
	•	Amazon
	•	Lazada
	•	Shopee
	•	Uniqlo
	•	Apple

⸻

6. Kids

Expenses specifically related to children.

Examples:
	•	School supplies
	•	Books
	•	Kids clothing
	•	Toys
	•	Enrichment classes
	•	Kids activities

⸻

7. Subscriptions

Recurring payments for services.

Examples:
	•	Netflix
	•	Spotify
	•	Apple subscriptions
	•	Cloud storage
	•	SaaS tools

⸻

8. Dining

Higher-end dining experiences or social dining events.

Examples:
	•	Fine dining
	•	Celebrations
	•	Group dining events
	•	Hotel restaurants

⸻

9. Flowers / Gifts

Purchases of flowers or gifting items.

Examples:
	•	Florists
	•	Gift shops
	•	Celebration bouquets

Example Merchants:
	•	MM Flowers
	•	Florists

⸻

10. Other

Used only when no other category fits.

Examples:
	•	Miscellaneous purchases
	•	Unknown merchants

⸻

Merchant Mapping Rules

When a new merchant appears:
	1.	Check if the merchant exists in the merchant knowledge base.
	2.	If yes → use the stored category.
	3.	If not:
	•	Analyze merchant business type using AI.
	•	Assign the closest category from this file.
	4.	Save the mapping:
	
Example:
NTUC FairPrice → Groceries
Toast Box → Eating Out
MM Flowers → Flowers / Gifts
Grab → Transport
This mapping should be stored in:
/knowledge/merchant_categories.json
Category Design Principles

The category system is optimized for:
	•	Household budgeting
	•	Grocery intelligence
	•	Spending trend analysis
	•	Reorder prediction for groceries

Avoid creating too many categories.

Target: 8–12 categories maximum.

⸻

Grocery Intelligence Categories

Items in the Groceries category should be tracked individually for:
	•	price history
	•	purchase frequency
	•	consumption cycles
	•	reorder predictions

Example tracked items:
	•	Milk
	•	Eggs
	•	Bread
	•	Rice
	•	Vegetables
	•	Fruits
	•	Chicken
	•	Fish
	•	Cooking oil
	•	Detergent
	•	Toiletries

⸻

Version

Categories Version: 1.0
