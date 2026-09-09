---
channelCategory: Website
points:
  food: 6
  retail: 8
  services: 6
  other: 7
---

# Uses modern security (HTTPS)

Your website needs HTTPS security - it's the padlock icon that shows customers their information is safe and encrypted when visiting your site.

::tech-detail{summary="What is HTTPS and how we check it"} HTTPS (Hypertext Transfer Protocol Secure) encrypts data between your website and visitors' browsers. We verify if your website URL starts with "https://" instead of "http://". This requires an SSL/TLS certificate installed on your web server. Google Chrome marks non-HTTPS sites as "Not Secure" which immediately scares away visitors. ::

## What we're checking

We verify that your website uses secure HTTPS encryption to protect customer data and build trust. This is now a basic requirement for all websites, not just e-commerce sites.

::impact{type="customers" severity="high"} **85% of online shoppers** avoid websites without HTTPS, and Google Chrome shows a **"Not Secure" warning** on HTTP sites ::

## What issues may it cause?

### Immediate visitor loss

- Chrome shows **"Not Secure" in red** on HTTP sites
- 82% of users leave immediately when seeing security warnings
- Mobile browsers show full-screen security warnings
- Customers won't enter contact forms or make purchases

### Search engine penalties

- Google **prioritizes HTTPS sites** in rankings since 2014
- HTTP sites pushed down in search results
- Missing the SEO boost from security signals
- Local search rankings also affected

### Business credibility damage

- Appears outdated and unprofessional
- Customers question if you protect their data
- Competitors with HTTPS look more trustworthy
- Payment processors may refuse to work with you

::example{type="bad" title="The cost of no HTTPS"} A local boutique ignored HTTPS warnings for their website:

- 67% bounce rate increase when Chrome added warnings
- Online contact form submissions dropped to zero
- Lost their payment processor due to security requirements
- Google ranking dropped from page 1 to page 3
- Finally added HTTPS but took 6 months to recover traffic ::

## How can I fix it?

::fix-step{number="1" title="Get an SSL certificate"} Options for SSL certificates:

- **Free option**: Let's Encrypt (recommended for most)
- **Paid options**: $10-200/year for extended validation
- Many hosting providers include free SSL
- Cloudflare offers free SSL with their CDN ::

::fix-step{number="2" title="Install the certificate"} Installation methods vary by host:

- **cPanel hosting**: Use "SSL/TLS" section, often one-click
- **WordPress**: Many hosts have automatic SSL installation
- **Manual**: Upload certificate files via hosting control panel
- **Cloudflare**: Enable with one toggle (easiest method) ::

::fix-step{number="3" title="Update your website"} After installation:

1. Change all internal links from http:// to https://
2. Update your sitemap with HTTPS URLs
3. Set up 301 redirects from HTTP to HTTPS
4. Update Google Business Profile with HTTPS URL
5. Submit new sitemap to Google Search Console ::

::fix-step{number="4" title="Fix mixed content"} Common issues to resolve:

- Update image URLs to use HTTPS
- Fix embedded videos and iframes
- Update external script sources
- Check for hardcoded HTTP links
- Use browser developer tools to find issues ::

::time-estimate{minutes="60" difficulty="easy"} With hosting provider support: 15-30 minutes Self-installation: 1-2 hours Fixing mixed content: 30-60 minutes ::

## What is the positive impact?

### Immediate trust signals

- **Green padlock icon** shows security
- "Connection is secure" message in browsers
- No scary warnings driving customers away
- Professional appearance builds confidence

### Better search rankings

- **5% ranking boost** confirmed by Google
- Eligible for rich search features
- Better local search visibility
- Faster page loading with HTTP/2

### Business benefits

- **13% higher conversion rates** on HTTPS sites
- Customers comfortable submitting forms
- Enable modern web features (location, camera)
- Meet requirements for payment processing

::example{type="good" title="HTTPS transformation"} Johnson's Hardware Store added HTTPS to their website:

- Bounce rate dropped from 71% to 34% immediately
- Contact form submissions increased 400%
- Google ranking improved from position 8 to 3
- Online quote requests increased by 250%
- Able to add online payment options
- Customer trust surveys improved by 45% Cost: $0 (used free Let's Encrypt certificate) ::

## Learn more

- [Google's HTTPS guide](https://developers.google.com/search/docs/advanced/security/https) - Official recommendations
- [Let's Encrypt](https://letsencrypt.org/) - Free SSL certificates
- [SSL test tool](https://www.ssllabs.com/ssltest/) - Check your HTTPS implementation
- [Mixed content finder](https://www.whynopadlock.com/) - Troubleshoot HTTPS issues
