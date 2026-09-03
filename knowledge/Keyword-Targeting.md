---
title: Keyword Targeting
topic_key: Keyword-Targeting
confidence: High
last_updated: 2026-09-02
sources:
  - url: https://advertising.amazon.com/solutions/products/sponsored-products
    type: official
    last_checked: 2026-09-02
  - url: https://www.junglescout.com/resources/articles/amazon-sponsored-product-ads/
    type: blog
    last_checked: 2026-09-02
  - url: https://github.com/amzn/amazon-advertising-api-php-sdk
    type: repo-readme
    last_checked: 2026-09-02
related: [Sponsored-Products, Match-Types, Campaign-Types, Advertising-API]
disputed: false
---

## Overview

For Sponsored Products campaigns, advertisers can either let Amazon's automatic targeting select relevant keywords for them or choose keywords manually. In manual campaigns, keyword targeting is used when the seller knows the specific search terms customers use, while product targeting lets them target competitor ASINs, categories, brands, or other product features; negative keywords let sellers exclude non-converting or irrelevant search terms so their ad stops appearing for those searches and they avoid paying for non-performing clicks. At the API level, negative keywords can be applied either at the ad group level or the campaign level (with campaign-level negatives only removable, not otherwise updatable), and the API can generate keyword suggestions for an ad group or a product ASIN, optionally including suggested bids.

## Facts

- For Sponsored Products, advertisers can choose keywords to target manually or let Amazon's automatic targeting select relevant keywords for them. — [source](https://advertising.amazon.com/solutions/products/sponsored-products), confidence: High, last-checked: 2026-09-02
- In manual Sponsored Products campaigns, keyword targeting is used when the seller knows the specific search terms customers use, while product targeting lets the seller target specific competitor ASINs, categories, brands, or other product features. — [source](https://www.junglescout.com/resources/articles/amazon-sponsored-product-ads/), confidence: Medium, last-checked: 2026-09-02
- Negative keywords in a Sponsored Products campaign are keywords for which the seller does not want their ad to appear, typically because they are not converting or not relevant, which stops the product from appearing for those searches and avoids paying for non-performing clicks. — [source](https://www.junglescout.com/resources/articles/amazon-sponsored-product-ads/), confidence: Medium, last-checked: 2026-09-02
- Negative keywords can be applied either at the ad group level (biddable keyword entity with a negative match type) or at the campaign level (campaign negative keywords), and campaign-level negative keywords can only be removed, not otherwise updated. (stale source) — [source](https://github.com/amzn/amazon-advertising-api-php-sdk), confidence: Low, last-checked: 2026-09-02
- The Amazon Advertising API can generate keyword suggestions for a specified ad group or for a specified product ASIN, and an extended ad-group suggestion call can also return a suggested bid for each recommended keyword. (stale source) — [source](https://github.com/amzn/amazon-advertising-api-php-sdk), confidence: Low, last-checked: 2026-09-02
