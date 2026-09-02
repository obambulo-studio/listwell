---
channelCategory: Website
points:
  food: 4
  retail: 6
  services: 4
  other: 5
---

# Website loads quickly

Your website needs to load fast - we check if customers can see your content within 3 seconds, because that's when most people give up and leave.

::tech-detail{summary="Technical details: Largest Contentful Paint (LCP) measurement"}
When `GOOGLE_API_KEY` is present, we read Chrome UX Report LCP first, then PageSpeed Insights LCP. If those keys are missing or return no LCP, we load the site in Cloudflare Browser Rendering for a synthetic LCP. The fallback is degraded and is not field data.

A good LCP score is under 2.5 seconds, acceptable is under 4 seconds, and anything over 4 seconds is considered poor.
::

## What we're checking

We measure how long our test browser waits before the main content is visible. This is a lab load, not a field report from Chrome users. Think of it like the time between opening your shop door and customers being able to see your products.

::impact{type="money" severity="high"}
**Amazon found that every 100ms of delay cost them 1% in sales.** For a small business making $100k/year online, a 1-second delay could mean $7,000 in lost revenue.
::

## What issues may it cause?

### Massive customer loss
- **53% of mobile visitors** leave if a page takes over 3 seconds
- **Every 1-second delay** reduces conversions by 7%
- On mobile networks, slow sites are even more frustrating
- Customers won't wait - they'll go to faster competitor sites

### Google ranking penalty
- **Speed is a ranking factor** since 2010 (mobile since 2018)
- Slow sites rank lower in search results
- Lower rankings = less traffic = fewer customers
- Google shows speed warnings for very slow sites

### Damaged reputation
- Users perceive slow sites as unprofessional or insecure
- **79% of customers** won't return to a slow site
- Negative word-of-mouth spreads quickly

::example{type="bad" title="Real cost of slow loading"}
A local furniture store's website took 8.5 seconds to load. Analytics showed:
- 68% bounce rate (people leaving immediately)
- Average of 112 lost customers per week
- Estimated $8,400 monthly revenue loss
After fixing speed issues, their sales increased by 34% in 3 months.
::

## How can I fix it?

::fix-step{number="1" title="Test your current speed"}
1. Visit [PageSpeed Insights](https://pagespeed.web.dev)
2. Enter your website URL and click "Analyze"
3. Look for your Performance score (aim for 90+)
4. Check the "Largest Contentful Paint" metric specifically
::

::fix-step{number="2" title="Fix images (biggest impact)"}
Images cause 80% of speed problems. Your web developer should:
- **Resize images** to actual display size (not 4000px wide for a 400px space)
- **Compress images** using tools like TinyPNG
- **Use modern formats** like WebP (30% smaller than JPEG)
- **Implement lazy loading** so images load as users scroll
::

::fix-step{number="3" title="Upgrade your hosting"}
Cheap hosting = slow website. Consider:
- **Business hosting** (from $20-50/month) vs shared hosting ($5/month)
- **SSD storage** for 3x faster file loading
- **CDN service** like Cloudflare (free tier available)
- **Server location** close to your customers
::

::fix-step{number="4" title="Optimize the code"}
Have your developer:
- **Minify CSS/JavaScript** (removes unnecessary characters)
- **Enable compression** (GZIP reduces file sizes by 70%)
- **Remove unused plugins** and scripts
- **Enable browser caching** so repeat visitors load faster
::

::time-estimate{minutes="240" difficulty="medium"}
Basic optimizations: 2-4 hours
Full optimization with hosting change: 1-2 days
::

## What is the positive impact?

### Immediate business benefits
- **70% lower bounce rate** - more people stay and browse
- **2x more page views** - fast sites encourage exploration
- **Higher conversion rates** - up to 24% improvement per second saved

### Better Google ranking
- Improved position in search results
- More organic traffic (free visitors)
- Google favors fast sites in mobile searches

### Happier customers
- Better user experience leads to repeat visits
- Positive reviews mention "easy to use" website
- Increased trust and professional image

::example{type="good" title="Speed optimization success"}
Tony's Pizza improved their site speed from 7.2 to 2.1 seconds:
- **Mobile orders increased 45%** in 2 months
- Jumped from page 2 to **top 3 in Google** for "pizza delivery [city]"
- Customer complaints about the website dropped to zero
- Investment of $500 in optimization returned $3,200 monthly revenue increase
::

## Learn more

- [Google's Web Vitals guide](https://web.dev/vitals/) - Official documentation
- [GTmetrix speed test](https://gtmetrix.com/) - Alternative testing tool
- [Image optimization guide](https://web.dev/fast/#optimize-your-images) - Detailed image tips
- [Choosing web hosting](https://web.dev/reliable/#use-a-good-web-host) - Hosting comparison guide 