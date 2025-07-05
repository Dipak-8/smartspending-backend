import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.common.keys import Keys
import requests
import time
import os
import json
import sys
import atexit

# --- Configuration ---
output_file = "pricehistory_page_source.html"
chart_data_file = "chart_data.json"

def cleanup_driver(driver):
    try:
        if driver:
            driver.quit()
    except:
        pass

def wait_for_page_load(driver, timeout=40):
    WebDriverWait(driver, timeout).until(
        lambda d: d.execute_script("return document.readyState") == "complete"
    )
    print("Page fully loaded", file=sys.stderr)

def wait_for_chart(driver, timeout=60):
    start_time = time.time()
    while time.time() - start_time < timeout:
        chart_count = driver.execute_script("return (window.Apex && Apex._chartInstances) ? Apex._chartInstances.length : 0;")
        if chart_count > 0:
            print(f"Chart instance detected: {chart_count}", file=sys.stderr)
            return True
        print("Waiting for chart instance...", file=sys.stderr)
        time.sleep(2)
    return False

def extract_chart_data(driver):
    print("Extracting chart data...", file=sys.stderr)
    js_script = """
    function getChartData() {
        const methods = [
            () => window.ApexCharts?.instances[0]?.chart?.series[0]?.data,
            () => window.chartData,
            () => {
                const script = Array.from(document.querySelectorAll('script'))
                    .find(s => s.textContent.includes('series') && s.textContent.includes('data'));
                if (script) {
                    try {
                        const match = script.textContent.match(/series:\\s*(\[.*?\])/s);
                        return match ? JSON.parse(match[1])[0].data : null;
                    } catch(e) {}
                }
                return null;
            },
            () => {
                if (window.Apex && Apex._chartInstances && Apex._chartInstances.length > 0) {
                    var chartData = Apex._chartInstances[0].chart.data;
                    if (chartData) {
                        var dates = chartData.twoDSeriesX;
                        var prices = chartData.twoDSeries;
                        return dates.map((timestamp, index) => {
                            return { x: new Date(timestamp).toISOString().split('T')[0], y: prices[index] };
                        });
                    }
                }
                return null;
            }
        ];
        for (const method of methods) {
            try {
                const result = method();
                if (result) return result;
            } catch(e) {}
        }
        return [];
    }
    return JSON.stringify(getChartData());
    """
    chart_data_json = driver.execute_script(js_script)
    return json.loads(chart_data_json) if chart_data_json else []

def main(amazon_link):
    options = uc.ChromeOptions()
    options.add_argument("--headless")
    options.add_argument("--start-maximized")
    options.add_argument("--disable-blink-features=AutomationControlled")
    driver = uc.Chrome(options=options)
    atexit.register(cleanup_driver, driver)

    try:
        print("Starting script...", file=sys.stderr)
        driver.get("https://www.pricehistoryapp.com/")
        wait_for_page_load(driver)

        wait = WebDriverWait(driver, 60)
        search_box = wait.until(EC.presence_of_element_located(
            (By.CSS_SELECTOR, "input[placeholder='Enter name or paste the product link']")
        ))
        search_box.clear()
        search_box.send_keys(amazon_link)
        print("Amazon link entered into the search box!", file=sys.stderr)
        time.sleep(1)
        search_box.send_keys(Keys.ENTER)

        print("Waiting for product page redirection...", file=sys.stderr)
        WebDriverWait(driver, 60).until(
            lambda d: "/product/" in d.current_url and d.current_url != "https://www.pricehistoryapp.com/"
        )

        wait.until(EC.presence_of_element_located((By.TAG_NAME, "h1")))
        time.sleep(2)

        if wait_for_chart(driver):
            chart_data = extract_chart_data(driver)
            return chart_data
        else:
            return []

    except Exception as e:
        print(f"Error during execution: {e}", file=sys.stderr)
        return []
    finally:
        driver.quit()

if __name__ == "__main__":
    amazon_url = sys.stdin.read().strip()
    if not amazon_url:
        print(json.dumps({"success": False, "message": "No URL provided"}))
        sys.exit(1)

    chart_data = main(amazon_url)
    result = {
        "success": bool(chart_data),
        "data": chart_data if chart_data else [],
        "message": "No chart data found" if not chart_data else "Success"
    }
    print(json.dumps(result))