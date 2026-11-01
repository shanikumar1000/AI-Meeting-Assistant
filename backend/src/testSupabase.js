require("dotenv").config();

const supabase = require("./config/supabase");

async function testSupabase() {
    const { data, error } = await supabase
        .from("meetings")
        .select("id")
        .limit(1);

    if (error) {
        console.error("Supabase connection failed:", error.message);
        return;
    }

    console.log("Supabase connection successful!");
    console.log("Meetings table is accessible.");
}

testSupabase();