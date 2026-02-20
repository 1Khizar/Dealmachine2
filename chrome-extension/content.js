// content.js - DOM-based scraping matching the Python scraper logic exactly
console.log("DealMachine Scraper Content Script Loaded.");

// Global state to track scraping
let isScrapingActive = false;
let scrapingShouldStop = false;

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "stopScraping") {
    scrapingShouldStop = true;
    console.log("🛑 Stop signal received");
    sendResponse({ success: true });
    return true;
  }

  if (request.action !== "executeScraperInContent") {
    return;
  }

  if (isScrapingActive) {
    sendResponse({ success: false, count: 0, error: "Scraper is already running" });
    return true;
  }

  const jwt = request.token;

  console.log("🚀 Starting DOM-based scraper (matching Python script logic)...");

  // ─── Helper: Delay ───
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // ─── Helper: Evaluate XPath and return first matching element ───
  function getElementByXPath(xpath) {
    try {
      const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
      return result.singleNodeValue;
    } catch (e) {
      return null;
    }
  }

  // ─── Helper: Evaluate XPath and return all matching elements ───
  function getElementsByXPath(xpath) {
    try {
      const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      const elements = [];
      for (let i = 0; i < result.snapshotLength; i++) {
        elements.push(result.snapshotItem(i));
      }
      return elements;
    } catch (e) {
      return [];
    }
  }

  // ─── Helper: Email validation (required) — matches Python is_valid_email ───
  function isValidEmail(email) {
    if (!email || email.trim() === "") return false;
    const emailPattern = /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
    return emailPattern.test(email.trim());
  }

  // ─── Helper: Phone validation (optional) — matches Python is_valid_phone ───
  function isValidPhone(phone) {
    if (!phone || phone.trim() === "") return true; // Phone is optional
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length >= 10;
  }

  // ─── Helper: Close popups — matches Python close_popups ───
  async function closePopups() {
    try {
      // Try to close survey popup
      const surveyButton = getElementByXPath('//*[@id="hj-survey-toggle-1"]');
      if (surveyButton) {
        surveyButton.click();
        console.log("✓ Closed survey popup");
        await delay(1000);
      }
    } catch (e) { /* ignore */ }

    try {
      // Try to close any overlay/modal
      const overlays = document.querySelectorAll('div[style*="fixed"], div[style*="modal"]');
      overlays.forEach(overlay => {
        const closeBtn = overlay.querySelector('button, [onclick], [class*="close"]');
        if (closeBtn) closeBtn.click();
      });
      await delay(500);
    } catch (e) { /* ignore */ }
  }

  // ─── Helper: Press Escape once — matches Python press_escape_once ───
  async function pressEscapeOnce() {
    try {
      document.body.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true
      }));
      document.body.dispatchEvent(new KeyboardEvent('keyup', {
        key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true
      }));
      // Also try focus + send
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true
      }));
      console.log("✓ Pressed Escape key");
      await delay(1000);
      return true;
    } catch (e) {
      console.warn("⚠️ Could not press Escape key:", e);
      return false;
    }
  }

  // ─── Helper: Safe click — matches Python safe_click ───
  async function safeClick(element, description = "") {
    const maxRetries = 2;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Scroll element into view
        element.scrollIntoView({ block: 'center', behavior: 'smooth' });
        await delay(500);

        // Try regular click first
        try {
          element.click();
        } catch (e) {
          // Fallback to creating a click event
          element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        }

        console.log(`✓ Clicked ${description}`);
        return true;
      } catch (e) {
        if (attempt < maxRetries - 1) {
          console.log(`⚠️ Retrying click for ${description}...`);
          await delay(1000);
        } else {
          console.log(`❌ Failed to click ${description}:`, e);
          return false;
        }
      }
    }
    return false;
  }

  // ─── Helper: Get addresses and cities — matches Python get_addresses_and_cities ───
  function getAddressesAndCities() {
    const addresses = [];
    const cities = [];

    try {
      const parent = document.querySelector(
        "#root > div:nth-child(2) > div > div.deal-container-fill-wrapper > div > div:nth-child(4) > div.deal-wrapper > div.deal-scroll.undefined > div > div:nth-child(3)"
      );

      if (!parent) {
        console.log("❌ Could not find address container");
        return { addresses: [], cities: [] };
      }

      const rows = parent.children;

      for (let i = 0; i < rows.length; i++) {
        try {
          const container = rows[i].querySelector(
            "div > div:nth-child(1) > div > div > div:nth-child(1)"
          );
          if (!container) continue;

          const fullText = container.innerText.trim();
          if (!fullText) continue;

          let addressLine1, addressLine2;
          if (fullText.includes('\n')) {
            [addressLine1, addressLine2] = fullText.split('\n', 2);
          } else {
            addressLine1 = fullText;
            addressLine2 = "";
          }

          addresses.push(addressLine1.trim());
          cities.push((addressLine2 || "").trim());
        } catch (e) {
          console.warn(`⚠️ Error processing address row ${i}:`, e);
          continue;
        }
      }

      console.log(`✓ Extracted ${addresses.length} addresses`);
      return { addresses, cities };

    } catch (e) {
      console.log("❌ Error extracting addresses:", e);
      return { addresses: [], cities: [] };
    }
  }

  // ─── Helper: Check for no contact information — matches Python has_no_contact_information ───
  function hasNoContactInformation() {
    const noContactIndicators = [
      "no contact information",
      "no contact info",
      "why no contact",
      "contact information unavailable",
      "no contact",
      "unavailable"
    ];

    for (const indicator of noContactIndicators) {
      try {
        const xpath = `//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '${indicator}')]`;
        const elements = getElementsByXPath(xpath);
        for (const element of elements) {
          if (element.offsetParent !== null) { // is displayed
            console.log(`⏭️ Skipping - No contact information: '${element.innerText.trim()}'`);
            return true;
          }
        }
      } catch (e) {
        continue;
      }
    }

    return false;
  }

  // ─── Helper: Check if owner popup is open — matches Python is_owner_popup_open ───
  function isOwnerPopupOpen() {
    try {
      const popupIndicators = [
        "//div[contains(@class, 'modal')]",
        "//div[contains(@class, 'popup')]",
        "//div[contains(@class, 'dialog')]",
        "/html/body/div[2]",
        "//*[contains(text(), 'Owner Information')]",
        "//*[contains(text(), 'Owner Info')]"
      ];

      for (const indicator of popupIndicators) {
        try {
          const elements = getElementsByXPath(indicator);
          for (const element of elements) {
            if (element.offsetParent !== null) {
              return true;
            }
          }
        } catch (e) {
          continue;
        }
      }

      return false;
    } catch (e) {
      return false;
    }
  }

  // ─── Helper: Find and click owner button — matches Python find_and_click_owner_button ───
  async function findAndClickOwnerButton() {
    await delay(2000);

    // First check if there's no contact information
    if (hasNoContactInformation()) {
      return false;
    }

    // Use the specific button selectors (matching Python script)
    const buttonSelectors = [
      "//*[@id='owner-information']/div[4]/div/div/div/div/div[2]/div[3]/div/div",
      "//*[@id='owner-information']/div[4]/div/div/div/div[3]/div/div/div",
      "//*[@id='owner-information']/div[4]/div/div",
    ];

    for (const selector of buttonSelectors) {
      try {
        console.log(`Trying selector: ${selector}`);
        const element = getElementByXPath(selector);
        if (element) {
          element.click();
          console.log(`✓ Clicked owner button using selector: ${selector}`);
          await delay(3000);
          if (isOwnerPopupOpen()) {
            console.log("✓ Owner popup opened successfully");
            return true;
          } else {
            console.log("⚠️ Button clicked but popup didn't open, trying next...");
          }
        } else {
          console.log(`✗ Selector not found: ${selector}`);
        }
      } catch (e) {
        console.warn(`⚠️ Error with selector ${selector}:`, e);
        continue;
      }
    }

    // Fallback: general JavaScript approach (matching Python script)
    try {
      console.log("Trying general JavaScript approach...");
      const ownerSection = document.querySelector('[id*="owner-information"], [class*="owner-information"]');
      if (ownerSection) {
        const buttons = ownerSection.querySelectorAll('button, div[role="button"], div[class*="clickable"], div[onclick]');
        for (const btn of buttons) {
          const text = (btn.textContent || btn.innerText || '').toLowerCase();
          if (text.includes('owner') || text.includes('information') || text.includes('view') || text.includes('details')) {
            btn.click();
            console.log("✓ Clicked owner button via general approach");
            await delay(3000);
            if (isOwnerPopupOpen()) {
              return true;
            }
          }
        }
        // Try any clickable if no specific buttons found
        if (buttons.length > 0) {
          buttons[0].click();
          console.log("✓ Clicked first clickable in owner section");
          await delay(3000);
          if (isOwnerPopupOpen()) {
            return true;
          }
        }
      }
      console.log("❌ General JavaScript approach failed");
      return false;
    } catch (e) {
      console.log("❌ General JavaScript click failed:", e);
      return false;
    }
  }

  // ─── Helper: Check if owner name is found — matches Python is_owner_name_found ───
  async function isOwnerNameFound() {
    try {
      await delay(1000);
      const nameXPath = "/html/body/div[2]/div[4]/div/div/div/div/div/div[2]/div[1]/div[1]/div/div/div/div/div/div[2]/div[1]/div/div";
      const nameElement = getElementByXPath(nameXPath);
      if (nameElement) {
        const name = nameElement.innerText.trim();
        if (name && name.length > 0) {
          console.log(`✓ Owner name found: ${name}`);
          return true;
        }
      }
      console.log("✗ Owner name not found");
      return false;
    } catch (e) {
      console.log("✗ Owner name check error:", e);
      return false;
    }
  }

  // ─── Helper: Read text from clipboard using Clipboard API ───
  async function readClipboard() {
    try {
      // Try navigator.clipboard (requires focus & permissions)
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        return text.trim();
      }
    } catch (e) {
      console.warn("Clipboard API failed:", e);
    }

    // Fallback: use a hidden textarea + execCommand('paste')
    try {
      const textarea = document.createElement('textarea');
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      textarea.style.top = '-9999px';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      document.execCommand('paste');
      const result = textarea.value.trim();
      document.body.removeChild(textarea);
      return result;
    } catch (e) {
      console.warn("Fallback clipboard read failed:", e);
      return "";
    }
  }

  // ─── Helper: Scrape owner details from popup — matches Python scrape_owner_details ───
  async function scrapeOwnerDetails(address, city) {
    let name = "", phone = "", email = "";

    // Wait for popup to fully load
    await delay(3000);

    // Check if owner name is found
    if (!await isOwnerNameFound()) {
      console.log("❌ Owner name not found, pressing Escape and skipping...");
      await pressEscapeOnce();
      return { name: "", phone: "", email: "" };
    }

    // Scrape name — matches Python xpath
    try {
      const nameXPath = "/html/body/div[2]/div[4]/div/div/div/div/div/div[2]/div[1]/div[1]/div/div/div/div/div/div[2]/div[1]/div/div";
      const nameElement = getElementByXPath(nameXPath);
      if (nameElement) {
        name = nameElement.innerText.trim();
        console.log(`✓ Scraped name: ${name}`);
      }
    } catch (e) {
      console.warn("⚠️ Could not scrape name:", e);
    }

    // Copy and get phone number — matches Python copy phone logic
    try {
      const phoneButtonXPath = "/html/body/div[2]/div[4]/div/div/div/div/div/div[2]/div[1]/div[4]/div[2]/div/div/div/div[2]/div[1]/div";
      const copyPhoneButton = getElementByXPath(phoneButtonXPath);
      if (copyPhoneButton) {
        if (await safeClick(copyPhoneButton, "phone copy button")) {
          await delay(2000);
          phone = await readClipboard();
          console.log(`✓ Copied phone: ${phone}`);
        }
      } else {
        console.log("⚠️ Phone copy button not found");
        // Fallback: try to find phone text directly in the popup
        phone = findPhoneInPopup();
      }
    } catch (e) {
      console.warn("⚠️ Could not copy phone:", e);
    }

    // Copy and get email — matches Python copy email logic
    try {
      const emailButtonXPath = "/html/body/div[2]/div[4]/div/div/div/div/div/div[2]/div[1]/div[5]/div[2]/div/div/div/div[2]/div[1]/div";
      const copyEmailButton = getElementByXPath(emailButtonXPath);
      if (copyEmailButton) {
        if (await safeClick(copyEmailButton, "email copy button")) {
          await delay(2000);
          email = await readClipboard();
          console.log(`✓ Copied email: ${email}`);
        }
      } else {
        console.log("⚠️ Email copy button not found");
        // Fallback: try to find email text directly in the popup
        email = findEmailInPopup();
      }
    } catch (e) {
      console.warn("⚠️ Could not copy email:", e);
    }

    return { name, phone, email };
  }

  // ─── Fallback: Find phone in popup via text scanning ───
  function findPhoneInPopup() {
    try {
      const popup = document.querySelector('div[class*="modal"], div[class*="popup"], body > div:nth-child(2)');
      if (!popup) return "";

      const allText = popup.innerText || "";
      // Look for phone patterns
      const phoneMatch = allText.match(/(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}/);
      if (phoneMatch) {
        console.log(`✓ Found phone via text scan: ${phoneMatch[0]}`);
        return phoneMatch[0];
      }
      return "";
    } catch (e) {
      return "";
    }
  }

  // ─── Fallback: Find email in popup via text scanning ───
  function findEmailInPopup() {
    try {
      const popup = document.querySelector('div[class*="modal"], div[class*="popup"], body > div:nth-child(2)');
      if (!popup) return "";

      const allText = popup.innerText || "";
      // Look for email patterns
      const emailMatch = allText.match(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/);
      if (emailMatch) {
        console.log(`✓ Found email via text scan: ${emailMatch[0]}`);
        return emailMatch[0];
      }
      return "";
    } catch (e) {
      return "";
    }
  }

  // ─── Helper: Click navigation button — matches Python click_navigation_button_if_available ───
  async function clickNavigationButton() {
    try {
      const navButtonXPath = '//*[@id="root"]/div[3]/div/div/div/div/div/div[2]/div[1]/div/div/div/div[1]';
      const navButton = getElementByXPath(navButtonXPath);
      if (navButton) {
        if (await safeClick(navButton, "navigation button")) {
          console.log("✓ Clicked navigation button");
          await delay(1000);
          return true;
        }
      }
      console.log("➡️ Navigation button not available, continuing...");
      return false;
    } catch (e) {
      console.log("➡️ Navigation button not available, continuing...");
      return false;
    }
  }

  // ─── Helper: Navigate to next row — matches Python navigate_to_next_row ───
  async function navigateToNextRow() {
    console.log("🔄 Moving to next row...");
    await clickNavigationButton();
    await delay(2000);
    return true;
  }

  // ─── Helper: Navigate to next page — matches Python navigate_to_next_page ───
  async function navigateToNextPage() {
    try {
      const nextButtonXPath = "//div[@role='button']//span[text()='Next']";
      const nextButton = getElementByXPath(nextButtonXPath);

      if (!nextButton) {
        console.log("✓ No more pages (next button not found)");
        return false;
      }

      // Check if button is disabled
      const buttonClass = nextButton.getAttribute("class") || "";
      const parent = nextButton.parentElement;
      const parentClass = parent ? (parent.getAttribute("class") || "") : "";

      if (buttonClass.includes("disabled") || parentClass.includes("disabled")) {
        console.log("✓ No more pages (next button disabled)");
        return false;
      }

      // Click using dispatch
      nextButton.click();
      console.log("✓ Moving to next page");
      await delay(5000);
      return true;
    } catch (e) {
      console.log("⚠️ Error during pagination:", e);
      return false;
    }
  }

  // ─── Helper: Send progress updates to popup ───
  function sendProgress(data) {
    try {
      chrome.runtime.sendMessage({
        action: "scraperProgress",
        ...data
      });
    } catch (e) {
      // Popup may be closed, ignore
    }
  }

  // ─── Main scraping logic — matches Python scraper() function ───
  (async () => {
    isScrapingActive = true;
    scrapingShouldStop = false;

    try {
      const savedAddresses = new Set();
      const csvRows = [];
      const csvHeader = ["address", "city", "name", "phone", "email"];

      let currentPage = 1;
      let totalRowsProcessed = 0;
      let totalValidRows = 0;

      // Close popups at start
      await closePopups();
      await delay(2000);

      // Page loop — matches Python while True loop
      while (!scrapingShouldStop) {
        // TEST LIMIT: Stop after 1 pages
        if (currentPage > 1) {
          console.log("🛑 Reached testing limit of 1 pages. Stopping.");
          break;
        }

        console.log(`\n=== Processing Page ${currentPage} ===`);
        await delay(3000);

        // Close popups at the start of each page
        await closePopups();

        // Get addresses and cities
        const { addresses, cities } = getAddressesAndCities();
        if (addresses.length === 0) {
          console.log("❌ No addresses found on current page");
          if (!await navigateToNextPage()) {
            console.log("✓ No more pages available");
            break;
          }
          currentPage++;
          continue;
        }

        sendProgress({
          page: currentPage,
          totalAddresses: addresses.length,
          totalValid: totalValidRows,
          status: "scraping"
        });

        // TEST LIMIT: Scrape only half page for testing
        const rowsToScrape = Math.ceil(addresses.length / 2);
        console.log(`🧪 Testing Mode: Scraping only half page (${rowsToScrape} of ${addresses.length} rows)`);

        for (let i = 0; i < rowsToScrape; i++) {
          if (scrapingShouldStop) {
            console.log("🛑 Scraping stopped by user");
            break;
          }

          const address = addresses[i];
          const city = cities[i] || "";

          if (savedAddresses.has(address)) {
            console.log(`⏭️ Skipping already saved address: ${address.substring(0, 30)}...`);
            continue;
          }

          console.log(`\n--- Processing row ${i + 1} of ${addresses.length} (Page ${currentPage}) ---`);

          // Click the view button for this row — matches Python click_view_button_and_scrape_details
          try {
            await closePopups();
            await delay(1000);

            const viewButtonXPath = `//*[@id='root']/div[2]/div/div[2]/div/div[4]/div[2]/div[2]/div/div[3]/div[${i + 1}]`;
            const viewButton = getElementByXPath(viewButtonXPath);

            if (!viewButton) {
              console.warn(`⚠️ Could not find view button for row ${i + 1}`);
              continue;
            }

            if (await safeClick(viewButton, `view button for row ${i + 1}`)) {
              console.log(`✓ Navigated to property details for row ${i + 1}`);
              await delay(3000);

              // Check if owner information is available — matches Python owner_indicators check
              let ownerFound = false;
              const ownerIndicators = [
                "//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'owner')]",
                "//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'resident')]",
                "//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'likely')]",
                "//span[contains(., 'Owner') or contains(., 'Resident')]",
                "//div[contains(., 'Owner') or contains(., 'Resident')]"
              ];

              for (const indicator of ownerIndicators) {
                try {
                  const elements = getElementsByXPath(indicator);
                  for (const element of elements) {
                    const text = (element.innerText || "").trim();
                    if (text && text.length > 3) {
                      ownerFound = true;
                      console.log(`✓ Found owner indicator: ${text.substring(0, 50)}`);
                      break;
                    }
                  }
                  if (ownerFound) break;
                } catch (e) {
                  continue;
                }
              }

              if (ownerFound) {
                console.log("Attempting to click owner information button...");

                if (await findAndClickOwnerButton()) {
                  console.log("✓ Successfully opened owner details popup");
                  await delay(3000);

                  // Scrape the details
                  const { name, phone, email } = await scrapeOwnerDetails(address, city);

                  // If nothing found, skip
                  if (name === "" && phone === "" && email === "") {
                    console.log("⏭️ Skipping due to missing owner information");
                    await navigateToNextRow();
                    totalRowsProcessed++;
                    continue;
                  }

                  // Validate: email is REQUIRED, phone is optional
                  const hasValidEmail = isValidEmail(email);
                  const hasValidPhone = isValidPhone(phone);

                  if (hasValidEmail) {
                    // Save the row
                    const rowData = [address, city, name, phone || "", email];
                    csvRows.push(rowData);
                    savedAddresses.add(address);
                    totalValidRows++;

                    if (hasValidPhone && phone) {
                      console.log(`✓ Saved COMPLETE row: ${address.substring(0, 30)}... (has email and phone)`);
                    } else {
                      console.log(`✓ Saved EMAIL-ONLY row: ${address.substring(0, 30)}... (has email but no/invalid phone)`);
                    }

                    sendProgress({
                      page: currentPage,
                      currentRow: i + 1,
                      totalAddresses: addresses.length,
                      totalValid: totalValidRows,
                      lastAddress: address.substring(0, 30),
                      status: "scraping"
                    });
                  } else {
                    console.log(`✗ Skipped row - missing valid email: ${address.substring(0, 30)}...`);
                  }

                  // Navigate to next row
                  await navigateToNextRow();
                } else {
                  console.log("❌ Could not find/click owner information button or no contact info");
                  await navigateToNextRow();
                }
              } else {
                console.log("✗ No owner/resident indicator found");
                await navigateToNextRow();
              }
            } else {
              console.log(`❌ Failed to navigate to property details for row ${i + 1}`);
            }

            totalRowsProcessed++;
          } catch (err) {
            console.error(`❌ Error processing row ${i + 1}:`, err);
            await navigateToNextRow();
            totalRowsProcessed++;
            console.log("⚠️ Continuing to next row...");
          }

          // Small delay between rows
          await delay(2000);
        }

        console.log(`→ Completed page ${currentPage}. Total rows processed: ${totalRowsProcessed}, Valid rows with email: ${totalValidRows}\n`);

        if (scrapingShouldStop) break;

        // Move to next page — matches Python navigate_to_next_page
        if (!await navigateToNextPage()) {
          console.log("✓ No more pages available");
          break;
        }

        currentPage++;
      }

      console.log(`🎉 Scraping complete! Total valid rows: ${totalValidRows}`);

      if (totalValidRows === 0) {
        console.warn("⚠️ No valid data found (email is required for each row)");
        sendResponse({
          success: false,
          count: 0,
          error: "No data with valid emails found",
          shouldLog: true,
          logData: { dataCount: 0, status: "completed", jwt }
        });
        isScrapingActive = false;
        return;
      }

      // Build CSV — matching Python CSV format: address, city, name, phone, email
      const allCsvRows = [csvHeader, ...csvRows];
      const csvText = allCsvRows
        .map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(","))
        .join("\r\n");

      // Download CSV
      const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const timestamp = new Date().toISOString().slice(0, 10);
      link.href = URL.createObjectURL(blob);
      link.download = `dealmachine_${timestamp}_${totalValidRows}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();

      console.log("💾 CSV file downloaded");

      sendResponse({
        success: true,
        count: totalValidRows,
        shouldLog: true,
        logData: { dataCount: totalValidRows, status: "completed", jwt }
      });

    } catch (err) {
      console.error("🚨 Scraper Error:", err);

      sendResponse({
        success: false,
        count: 0,
        error: err.message || "Unknown error occurred",
        shouldLog: true,
        logData: { dataCount: 0, status: "failed", jwt }
      });
    } finally {
      isScrapingActive = false;
      scrapingShouldStop = false;
    }
  })();

  return true; // keep the message channel open for async response
});