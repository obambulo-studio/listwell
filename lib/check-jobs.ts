import { z } from "zod";

const checkJobSchema = z.object({
  handoff: z.string(),
  owner: z.enum(["you", "website"]),
  plainTitle: z.string(),
  problem: z.string(),
  steps: z.array(z.string()).min(2).max(4),
});

export type CheckJob = z.infer<typeof checkJobSchema>;

const checkJobsSchema = z.record(z.string(), checkJobSchema);

const CHECK_JOBS = checkJobsSchema.parse({
  "deliveroo-listing": {
    handoff:
      "If Deliveroo says they do not deliver in your suburb, skip this. You cannot create a listing outside their area.",
    owner: "you",
    plainTitle: "Get on Deliveroo",
    problem:
      "People ordering food on Deliveroo cannot see you, so that order goes to someone else.",
    steps: [
      "On your phone, open the Deliveroo app and search your suburb. If they do not deliver there, stop.",
      "Go to restaurants.deliveroo.com and apply with your ABN, address, and menu.",
      "When the listing is live, copy the page link and add it under Edit listings on this report.",
    ],
  },
  "doordash-listing": {
    handoff:
      "DoorDash will email you to finish signup. The listing is not live until you complete that email.",
    owner: "you",
    plainTitle: "Get on DoorDash",
    problem: "DoorDash customers in your area cannot order from you.",
    steps: [
      "Go to merchantdoor.doordash.com and start a restaurant application.",
      "Enter the same name, address, and phone you use on Google.",
      "After approval, add the DoorDash link under Edit listings on this report.",
    ],
  },
  "facebook-page": {
    handoff:
      "A personal profile does not count. If Facebook asks you to confirm your identity, finish that or the page stays hidden.",
    owner: "you",
    plainTitle: "Create a Facebook page",
    problem:
      "People looking you up on Facebook find nothing, or they find a personal account instead of the business.",
    steps: [
      "Open facebook.com/pages/create and choose a business page, not a personal profile.",
      "Use your real business name, suburb, phone, and hours. Add a logo and one photo of the shop or van.",
      "Copy the page link and add it under Edit listings on this report.",
    ],
  },
  "google-listing": {
    handoff:
      "Google often posts a postcard to your address. The listing will not show properly until you enter that code. Check the mail over the next two weeks.",
    owner: "you",
    plainTitle: "Claim your Google listing",
    problem:
      "When someone searches your trade and suburb on Google, your business does not come up on the map.",
    steps: [
      "On your phone, open business.google.com and search your business name and address.",
      "If it appears, tap Claim this business. If it does not, tap Add your business.",
      "Verify with the phone call, email, or postcard Google sends. Then add your hours, phone, and website.",
    ],
  },
  "google-listing-opening-times": {
    handoff:
      "If you cannot edit hours, you do not own the listing yet. Claim it first. Google will not let anyone else change the hours.",
    owner: "you",
    plainTitle: "Put your hours on Google",
    problem:
      "Google is showing the wrong hours, or no hours, so people turn up when you are shut or assume you are closed.",
    steps: [
      "Open the Google Maps app and search your business name.",
      "Tap your listing, then Suggest an edit or Edit profile, then Hours.",
      "Set open and close for each day you work, mark closed days as Closed, and save.",
    ],
  },
  "google-listing-phone-number": {
    handoff:
      "Use the exact number customers call, including the area code. A mobile and a landline are different numbers. Pick one and use it everywhere.",
    owner: "you",
    plainTitle: "Use the same phone number on Google",
    problem:
      "The number on Google is missing or different from your website, so people call the wrong place.",
    steps: [
      "Open your Google listing the same way as the hours job.",
      "Edit the phone number so it matches the number printed on your website and van.",
      "Save, then call it yourself from another phone to confirm it rings you.",
    ],
  },
  "google-listing-photos": {
    handoff:
      "Google rejects blurry or logo-only shots. Use real photos of the work, the shop, or the van.",
    owner: "you",
    plainTitle: "Add photos on Google",
    problem:
      "Your Google listing has too few photos, so people scroll to a competitor who shows the work.",
    steps: [
      "Take 5 photos in daylight: the outside, the inside or van, and finished jobs. No stock photos.",
      "Open your Google listing, tap Photos, then Add photo.",
      "Upload those 5, and set the clearest outside shot as the cover.",
    ],
  },
  "google-listing-primary-category": {
    handoff:
      "Pick the category a customer would search, such as Plumber, not a vague one like Service. You can add extra categories after the main one.",
    owner: "you",
    plainTitle: "Set what you do on Google",
    problem:
      "Google has you in the wrong type of business, so you do not show up for the searches that bring work.",
    steps: [
      "Open your Google listing and find Business category.",
      "Set the primary category to the job people hire you for.",
      "Save. If the category you want is missing, choose the closest trade and add the exact one as an extra category.",
    ],
  },
  "google-listing-rating": {
    handoff:
      "Do not offer a discount for a review. Google removes those and can suspend the listing. Only ask people who are already happy.",
    owner: "you",
    plainTitle: "Get your Google rating up",
    problem:
      "Your Google stars are under 4, and a lot of people will not call a business under 4 stars.",
    steps: [
      "Read the recent bad reviews and fix the complaint they mention. Reply on Google in one or two plain sentences.",
      "Ask the next happy customers, in person, to leave a Google review. Show them the review screen on your phone.",
      "Keep doing that until the average is 4.0 or higher. This takes weeks, not an afternoon.",
    ],
  },
  "google-listing-review-count": {
    handoff:
      "If you have almost no reviews, the rating job and this job are the same work. Do not buy reviews.",
    owner: "you",
    plainTitle: "Get more Google reviews",
    problem:
      "You have fewer than 20 Google reviews, so you look newer or quieter than businesses around you.",
    steps: [
      "On your Google listing, tap Ask for reviews and copy the short link.",
      "Text that link to recent happy customers. One message is enough: Hi, if you were happy with the job, a Google review helps us a lot.",
      "Ask again at the end of each job until you pass 20 reviews.",
    ],
  },
  "google-listing-website-matches": {
    handoff:
      "The link must open your site, not a Facebook page and not a dead page. Test it in a private window.",
    owner: "you",
    plainTitle: "Put your website on Google",
    problem:
      "The website button on Google is missing or goes to the wrong site.",
    steps: [
      "Open your Google listing and edit the website field.",
      "Paste your real website address, starting with https://.",
      "Save, then tap the website button on the public listing and check it opens your homepage.",
    ],
  },
  "instagram-profile": {
    handoff:
      "Switch the account to a professional account in Instagram settings, or customers cannot tap Call or Email.",
    owner: "you",
    plainTitle: "Create an Instagram profile",
    problem: "People who look you up on Instagram do not find the business.",
    steps: [
      "In the Instagram app, create an account with your business name.",
      "Settings, Account type, Switch to professional account. Add your phone, suburb, and website.",
      "Post 3 real photos, copy the profile link, and add it under Edit listings on this report.",
    ],
  },
  "linkedin-profile": {
    handoff:
      "Use a company page, not your personal LinkedIn. Personal profiles do not count.",
    owner: "you",
    plainTitle: "Create a LinkedIn page",
    problem:
      "Business customers checking you on LinkedIn cannot find a company page.",
    steps: [
      "Go to linkedin.com/company/setup/new and create a company page.",
      "Use your business name, website, and a one-sentence description of what you do.",
      "Add the page link under Edit listings on this report.",
    ],
  },
  "menulog-listing": {
    handoff:
      "Menulog approval can take several days. You are not listed until they email you that it is live.",
    owner: "you",
    plainTitle: "Get on Menulog",
    problem: "People ordering on Menulog cannot choose you.",
    steps: [
      "Go to menulog.com.au and open the partner or restaurant signup.",
      "Apply with your ABN, address, and menu. Use the same phone as on Google.",
      "When the listing is live, add the Menulog link under Edit listings on this report.",
    ],
  },
  "social-profile-banner": {
    handoff:
      "A banner is the wide image at the top of the page, not your round logo. If a site will not let you upload one, skip that site.",
    owner: "you",
    plainTitle: "Add a cover photo on social pages",
    problem:
      "Your Facebook or other pages look unfinished because the top banner is empty.",
    steps: [
      "Use one wide photo of the shopfront, van, or finished work.",
      "On each page we listed, open the cover or banner and upload that photo.",
      "Refresh the page. You should see the photo across the top, not a blank grey bar.",
    ],
  },
  "social-profile-freshness": {
    handoff:
      "A story that disappears in 24 hours may not count. Post a normal post that stays on the page.",
    owner: "you",
    plainTitle: "Post something this month",
    problem: "Your social pages have gone quiet, so they look closed.",
    steps: [
      "Open each page named in this report.",
      "Post one photo and one sentence about a recent job, special, or opening hours.",
      "Check the post is public, not friends-only.",
    ],
  },
  "social-profile-image-match": {
    handoff:
      "Use the same file everywhere. A cropped, recoloured, or old logo still looks like a different business.",
    owner: "you",
    plainTitle: "Use the same logo everywhere",
    problem:
      "Your profile photos do not match, so people are not sure it is the same business.",
    steps: [
      "Pick one logo file.",
      "On each social page, set that file as the profile photo.",
      "Check Facebook, Instagram, and any other page you added. The small round photo should match.",
    ],
  },
  "tiktok-profile": {
    handoff:
      "You need a TikTok Business account. A personal account with no business name will not match.",
    owner: "you",
    plainTitle: "Create a TikTok profile",
    problem: "You have no TikTok page for the business.",
    steps: [
      "Download TikTok and sign up with your business name.",
      "Switch to a business account in settings, and add your suburb and phone.",
      "Post one short clip of real work, then add the profile link under Edit listings.",
    ],
  },
  "uber-eats-listing": {
    handoff:
      "Uber Eats will not list you outside their delivery area. If the signup says you are out of range, stop.",
    owner: "you",
    plainTitle: "Get on Uber Eats",
    problem: "Uber Eats customers cannot order from you.",
    steps: [
      "Go to merchants.ubereats.com and start signup.",
      "Use the same name, address, and phone as Google.",
      "After the store is live, add the Uber Eats link under Edit listings on this report.",
    ],
  },
  website: {
    handoff:
      "If the address already starts with https:// and the browser still says Not secure, the certificate is broken. Your host has to renew it. You cannot fix that in a text editor.",
    owner: "website",
    plainTitle: "Turn on the padlock for your website",
    problem:
      "The browser warns people that your site is not secure, and many of them leave.",
    steps: [
      "Open your website. Look at the address bar.",
      "If it starts with http:// and not https://, email your website person or host and ask them to turn on the free SSL certificate.",
      "When they reply that it is done, reload the site. You want a padlock and an address starting with https://.",
    ],
  },
  "website-200-299": {
    handoff:
      "If you see 404, the page was moved or deleted. Send your website person the exact address that failed. Do not keep refreshing it.",
    owner: "website",
    plainTitle: "Make the website open",
    problem:
      "Your website does not load. Customers hit an error instead of your phone number.",
    steps: [
      "Open your website on your phone, off the workshop wifi.",
      "If you see an error, a blank page, or Page not found, screenshot it.",
      "Send that screenshot to whoever hosts the site and ask them to restore the homepage.",
    ],
  },
  "website-ai-visibility": {
    handoff:
      "This one is slow. You cannot force ChatGPT or Google’s AI to mention you. The useful move is making your name, suburb, and services obvious on your own site.",
    owner: "website",
    plainTitle: "Make it obvious what you do and where",
    problem:
      "Your site does not clearly say your business name, suburb, and services, so search tools have nothing solid to quote.",
    steps: [
      "On the homepage, the first screen should say the business name, what you do, and the suburb.",
      "Ask your website person to put that in normal text, not only inside a picture.",
      "Publish it, then search the page for your suburb. If the suburb is only in a photo, it does not count.",
    ],
  },
  "website-canonical": {
    handoff:
      "Leave this to your website person. Two addresses for the same page confuse Google. They should pick one and point the other at it.",
    owner: "website",
    plainTitle: "Use one website address",
    problem:
      "Your site answers on more than one address, so Google is not sure which page to show.",
    steps: [
      "Send your website person this note: pick one homepage address and set the other versions to point to it.",
      "The address you keep should be the one on your Google listing.",
      "After they publish, open the site and check the address matches that one.",
    ],
  },
  "website-gbp-name-address-phone": {
    handoff:
      "Match Google exactly, including St vs Street and the suburb. A near match still fails.",
    owner: "you",
    plainTitle: "Put the same name, address, and phone on your website",
    problem:
      "Your website and your Google listing disagree on the name, address, or phone.",
    steps: [
      "Open Google Maps and write down the name, address, and phone shown there.",
      "Open your website contact page. Change it to those exact words, or ask your website person to.",
      "Save and compare them side by side. They should match character for character.",
    ],
  },
  "website-localbusiness-jsonld": {
    handoff:
      "If they say it is already there, ask them to search the homepage source for LocalBusiness. If your address in that block differs from Google, update the block.",
    owner: "website",
    plainTitle: "Add your business details for Google in the site code",
    problem:
      "Your website does not include a hidden business card that Google reads: name, address, phone, and hours.",
    steps: [
      "Email your website person: please add LocalBusiness structured data to the homepage.",
      "It must use the same name, address, phone, and hours as your Google listing.",
      "Ask them to reply when it is live. You do not need to edit code yourself.",
    ],
  },
  "website-menu-jsonld": {
    handoff:
      "Skip this if you are not a food business. If you are, the menu on the site and the structured menu have to list the same items.",
    owner: "website",
    plainTitle: "Put the menu in a form Google can read",
    problem:
      "Your menu is only in a picture or a PDF, so Google cannot tell what you serve.",
    steps: [
      "Send your website person the current menu as text, not a photo.",
      "Ask them to add Menu structured data and also show the items as normal text on the page.",
      "Open the menu page and check you can select the item names with your finger. If you cannot, it is still just a picture.",
    ],
  },
  "website-meta-description": {
    handoff:
      "One or two sentences. Include what you do and the suburb. Do not stuff a list of keywords.",
    owner: "website",
    plainTitle: "Write the one-line description Google shows",
    problem:
      "Google is making up the snippet under your site name, or leaving it blank.",
    steps: [
      "Write one sentence: what you do, the suburb, and how to get in touch.",
      "Send it to your website person and ask them to set it as the homepage meta description.",
      "Search your business name on Google. The grey line under the result should be close to your sentence.",
    ],
  },
  "website-mobile-responsive": {
    handoff:
      "Pinch-zooming to read the phone number means it failed. A website person has to rebuild the layout. Raising the text size in your phone settings does not fix it.",
    owner: "website",
    plainTitle: "Make the website usable on a phone",
    problem:
      "On a phone, the text is tiny or the page scrolls sideways, so people cannot tap your number.",
    steps: [
      "Open your website on your phone.",
      "If you have to zoom or scroll sideways to read the phone number, screenshot it.",
      "Send the screenshot to your website person and ask them to make the page fit a phone, with a tap-to-call number.",
    ],
  },
  "website-og-image": {
    handoff:
      "Use a photo, not a tiny logo. The picture should still make sense when Facebook crops it to a wide rectangle.",
    owner: "website",
    plainTitle: "Choose the photo that shows when you share the site",
    problem:
      "When someone shares your website, the preview image is missing or wrong.",
    steps: [
      "Pick one clear photo of the business.",
      "Ask your website person to set it as the share image on the homepage.",
      "Paste your homepage into a Facebook post as a test. You should see that photo before you publish. Delete the test.",
    ],
  },
  "website-opening-hours": {
    handoff:
      "Hours hidden inside a picture do not count. They have to be real text.",
    owner: "you",
    plainTitle: "Print your hours on the website",
    problem: "Your website never says when you are open.",
    steps: [
      "Write the hours the same way as on Google, including days you are closed.",
      "Put them on the contact page in normal text, or ask your website person to.",
      "On your phone, find those hours without opening a PDF or zooming into a picture.",
    ],
  },
  "website-performance": {
    handoff:
      "Huge photos are the usual cause. Ask them to shrink photos, not to redesign the whole site.",
    owner: "website",
    plainTitle: "Make the website load faster",
    problem:
      "The site takes too long to show the main content, and people leave before they see your number.",
    steps: [
      "On your phone, off wifi, open the homepage and count. If the main photo and phone number take more than a few seconds, it is too slow.",
      "Ask your website person to compress the homepage photos and remove anything that is not needed to call you.",
      "Test again on mobile data. The phone number should be on screen quickly.",
    ],
  },
  "website-physical-address": {
    handoff:
      "If you go to customers and have no shopfront, say the suburbs you cover in text. Do not invent a street address.",
    owner: "you",
    plainTitle: "Show your address on the website",
    problem:
      "The website does not show where you are, so people cannot tell if you serve them.",
    steps: [
      "Put the street address from your Google listing on the contact page as text.",
      "If you have no public address, write the suburbs you travel to, in text.",
      "Check it on your phone. You should be able to copy the suburb with your finger.",
    ],
  },
  "website-robots": {
    handoff:
      "A file called robots.txt can accidentally tell Google to ignore the whole site. Your website person should allow the homepage.",
    owner: "website",
    plainTitle: "Let Google read the website",
    problem: "Your website is telling Google not to list it.",
    steps: [
      "Email your website person: Google cannot index the site. Please check robots.txt and the noindex tag.",
      "Ask them to allow the homepage and contact page.",
      "After they publish, search Google for your exact business name in quotes. It can take a few days to appear.",
    ],
  },
  "website-sitemap": {
    handoff:
      "A sitemap is a list of your pages for Google. You do not write it by hand if the site has a builder. Ask them to turn the sitemap on.",
    owner: "website",
    plainTitle: "Give Google a list of your pages",
    problem: "Google has no list of the pages on your website.",
    steps: [
      "Ask your website person to publish a sitemap and submit it in Google Search Console.",
      "If you use Squarespace, Wix, or Shopify, ask them which menu turns the sitemap on. Do not install extra plugins yourself.",
      "They should send you the sitemap address. It usually ends in sitemap.xml and should open as a list of links.",
    ],
  },
  "website-tel-link": {
    handoff:
      "The number must be a link, not just digits in a picture. On a phone, tapping it should open the phone app.",
    owner: "website",
    plainTitle: "Make the phone number tappable",
    problem:
      "On a phone, people cannot tap your number to call. They have to copy it.",
    steps: [
      "On your phone, open the website and tap the phone number.",
      "If the phone app does not open, tell your website person: make the phone number a tap-to-call link.",
      "Test again. One tap should open the dialler with your number filled in.",
    ],
  },
  "website-title": {
    handoff:
      "The title is the blue line in Google, not the big heading on the page. It needs your name and suburb.",
    owner: "website",
    plainTitle: "Put your name and suburb in the Google title",
    problem:
      "The title Google shows for your site leaves out your business name or your suburb.",
    steps: [
      "Decide the line: Business name | Trade in Suburb. Example: North Plumbing | Plumber in Parramatta.",
      "Ask your website person to set that as the homepage title.",
      "Search your business on Google later. The blue link should include the name and suburb.",
    ],
  },
  "youtube-profile": {
    handoff:
      "A personal channel with no business name is easy to miss. Name it after the business.",
    owner: "you",
    plainTitle: "Create a YouTube channel",
    problem: "You have no YouTube channel for the business.",
    steps: [
      "Go to youtube.com/create_channel and create a channel in the business name.",
      "Add your logo, suburb, and website in the about section.",
      "Upload one short video, even a phone clip, then add the channel link under Edit listings.",
    ],
  },
} satisfies Record<string, CheckJob>);

const fallbackJob = (title: string): CheckJob =>
  checkJobSchema.parse({
    handoff:
      "If a step asks you to change the website code, send it to whoever built the site instead of guessing.",
    owner: "you",
    plainTitle: title,
    problem: "This is still outstanding.",
    steps: [
      "Read the short name of the job and decide if it is something you change yourself, such as Google or Facebook.",
      "If it is about the website code, forward this report to your website person.",
      "When it is done, run the report again to confirm it clears.",
    ],
  });

export const jobForCheck = (id: string, title: string): CheckJob =>
  CHECK_JOBS[id] ?? fallbackJob(title);

export const knownCheckJobIds = (): string[] => Object.keys(CHECK_JOBS);
