---
title: Campaign Types
topic_key: Campaign-Types
confidence: Medium
last_updated: 2026-09-02
sources:
  - url: https://www.junglescout.com/resources/articles/amazon-sponsored-product-ads/
    type: blog
    last_checked: 2026-09-02
  - url: https://github.com/amzn/amazon-advertising-api-php-sdk
    type: repo-readme
    last_checked: 2026-09-02
related: [Sponsored-Products, Match-Types, Keyword-Targeting, Advertising-API]
disputed: false
---

## Overview

Sponsored Products campaigns support two targeting approaches: automatic targeting, where Amazon selects keywords or products based on listing information, and manual targeting, where the seller chooses specific keywords or products and sets custom bids. Campaigns are created in Seller Central under Advertising > Campaign Manager > Create Campaign, with setup covering the campaign name, date range, an optional portfolio, daily budget, bidding strategy, keywords, and targeting type. At the API level, campaigns are represented with a campaignType field (e.g. 'sponsoredProducts') and a targetingType field (e.g. 'manual'), alongside name, dailyBudget, startDate, and state.

## Facts

- Sponsored Products campaigns offer two targeting options: automatic targeting, where Amazon selects keywords or products to target based on listing information, and manual targeting, where the seller chooses specific keywords or products and can set custom bids. — [source](https://www.junglescout.com/resources/articles/amazon-sponsored-product-ads/), confidence: Medium, last-checked: 2026-09-02
- A Sponsored Products campaign is created in Seller Central by going to the Advertising tab, then Campaign Manager, then Create Campaign, and selecting Sponsored Products as the campaign type; setup includes campaign name, date range, optional portfolio, daily budget, bidding strategy, keywords, and targeting type. — [source](https://www.junglescout.com/resources/articles/amazon-sponsored-product-ads/), confidence: Medium, last-checked: 2026-09-02
- Campaigns in the Amazon Advertising API are created with a campaignType field (e.g. 'sponsoredProducts') and a targetingType field (e.g. 'manual') alongside name, dailyBudget, startDate, and state. (stale source) — [source](https://github.com/amzn/amazon-advertising-api-php-sdk), confidence: Low, last-checked: 2026-09-02
