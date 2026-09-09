---
channelCategory: Website
points:
  food: 3
businessCategories:
  - food
---

# Menu structured data (JSON-LD)

Help Google understand your menu items with structured data - so hungry customers can find exactly what they're craving before they even visit your website.

::tech-detail{summary="What is Menu JSON-LD structured data"} JSON-LD (JavaScript Object Notation for Linked Data) is code that helps search engines understand your menu items. We scan your menu pages for structured data that includes:

- Menu item names and descriptions
- Prices and dietary information
- Categories and sections
- Images and preparation details

When implemented correctly, Google can display your menu items directly in search results, making it easier for customers to find specific dishes. ::

## What we're checking

We verify that your menu pages include properly formatted structured data that tells search engines about your food items, prices, and descriptions.

::impact{type="customers" severity="medium"} Restaurants with menu structured data see **35% more clicks** from food-related searches and appear in Google's **"Order Food Near Me"** features ::

## What issues may it cause?

### Invisible menu in search results

- Your delicious dishes won't appear when people search for specific foods
- Lost opportunities from customers craving exactly what you serve
- Missing from Google's food ordering features
- No rich snippets showing prices and descriptions

::example{type="bad"} **Without structured data**: Customer searches "chicken tikka masala near me" - your restaurant doesn't appear even though it's your specialty dish. ::

::example{type="good"}  
**With structured data**: Same search shows your restaurant with "Chicken Tikka Masala - $16.99" directly in Google results. ::

## How to fix this

::fix-step{number="1"} **Add Menu schema to your menu pages** Include JSON-LD code in your menu page headers that describes each dish with proper Menu schema markup. ::

::fix-step{number="2"} **Structure your menu items** Organize items with names, descriptions, prices, dietary restrictions, and food categories using schema.org/Menu vocabulary. ::

::fix-step{number="3"} **Include high-quality images** Add image URLs to your structured data so Google can show appealing photos of your dishes in search results. ::

::fix-step{number="4"} **Test with Google's tools** Use Google's Rich Results Test to verify your menu structured data is properly formatted and error-free. ::

::time-estimate{time="2-4 hours" difficulty="Medium"} Requires basic HTML knowledge or developer assistance to implement the JSON-LD code correctly ::

## Positive impact

### Enhanced search visibility

- **35% increase** in clicks from food-related searches
- Menu items appear directly in Google search results
- Featured in Google's food ordering and delivery options
- Rich snippets with prices, ratings, and photos
- Better local SEO performance for restaurant searches

## Learn more

- [Google Menu Structured Data Guide](https://developers.google.com/search/docs/appearance/structured-data/menu)
- [Schema.org Menu Documentation](https://schema.org/Menu)
- [Rich Results Test Tool](https://search.google.com/test/rich-results)
