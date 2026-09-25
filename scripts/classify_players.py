#!/usr/bin/env python3
"""
Iteration 2 -- one-pass player tier + popular_name classification.

This is an explicit DRAFT (per the design doc): a first pass over all 809
players using cricket domain knowledge, expected to need user review and
correction afterward. It is deliberately conservative on popular_name --
default is always the existing full_name; we only override where there's
real confidence about a well-known alias, per instruction ("use full names
in case you are not sure").

Tier weighting (from game-design-notes.md "Reveal weighting v2"):
  marquee x4, greats x2.5, popular x2, random x2
Since popular and random share the same weight, the popular/random boundary
has ZERO gameplay effect -- it only affects any future display/flavor use.
So the real stakes here are getting marquee/greats right; popular vs random
is a best-effort convenience label, not a precision-critical field.

Classification is keyed by `short_name` (Cricinfo's short scorecard name,
e.g. "MS Dhoni") for tier membership, and by `full_name` for the
popular_name override map, since those are the two columns being read from
/ written to respectively.
"""
import pandas as pd

IN_PATH = "players_import.csv"
OUT_PATH = "players_import_v2.csv"

df = pd.read_csv(IN_PATH)

# ---------------------------------------------------------------------------
# MARQUEE -- the true global superstars / all-time icons of the IPL. Highest
# weight tier (x4). Kept deliberately small and high-bar.
# ---------------------------------------------------------------------------
MARQUEE = {
    "MS Dhoni", "V Kohli", "RG Sharma", "SR Tendulkar", "AB de Villiers",
    "CH Gayle", "AD Russell", "JJ Bumrah", "Rashid Khan", "SP Narine",
    "JC Buttler", "DA Warner", "Shubman Gill", "SA Yadav", "HH Pandya",
    "KL Rahul", "RR Pant", "RA Jadeja", "YS Chahal", "KS Williamson",
    "SPD Smith", "GJ Maxwell", "MA Starc", "TA Boult", "PJ Cummins",
    "JC Archer", "BA Stokes", "Shakib Al Hasan", "SK Warne", "B Lee",
    "AC Gilchrist", "RT Ponting", "SC Ganguly", "R Dravid", "V Sehwag",
    "G Gambhir", "Yuvraj Singh", "Harbhajan Singh", "Z Khan", "S Dhawan",
    "F du Plessis", "Q de Kock", "H Klaasen", "KA Pollard", "DJ Bravo",
    "SL Malinga", "DPMD Jayawardene", "KC Sangakkara", "M Muralidaran",
    "PW Hasaranga", "Mustafizur Rahman", "TM Head", "R Ashwin", "K Rabada",
    "KP Pietersen", "Shoaib Akhtar", "ST Jayasuriya", "Shahid Afridi",
    "JH Kallis", "A Kumble", "BB McCullum", "SM Pollock",
}

# ---------------------------------------------------------------------------
# GREATS -- very good, well-established international regulars and IPL
# stalwarts; a clear notch below the marquee tier. Weight x2.5.
# ---------------------------------------------------------------------------
GREATS = {
    # India
    "SK Raina", "RV Uthappa", "MK Pandey", "AM Rahane", "CA Pujara",
    "WP Saha", "KD Karthik", "PA Patel", "AT Rayudu", "YK Pathan",
    "IK Pathan", "VVS Laxman", "A Nehra", "S Sreesanth", "AB Agarkar",
    "PP Chawla", "A Mishra", "I Sharma", "UT Yadav", "MM Sharma",
    "B Kumar", "DL Chahar", "AR Patel", "HV Patel", "Mohammed Shami",
    "Mohammed Siraj", "Arshdeep Singh", "T Natarajan", "M Prasidh Krishna",
    "MP Yadav", "CV Varun", "Ravi Bishnoi", "Avesh Khan", "Umran Malik",
    "Kuldeep Yadav", "Washington Sundar", "SN Thakur", "KH Pandya",
    "DJ Hooda", "R Tewatia", "S Dube", "RK Singh", "R Parag",
    "B Sai Sudharsan", "VR Iyer", "SS Iyer", "SV Samson", "PP Shaw",
    "D Padikkal", "RD Gaikwad", "YBK Jaiswal", "NT Tilak Varma",
    "K Nitish Kumar Reddy", "Abhishek Sharma", "JD Unadkat",
    # Australia
    "SR Watson", "AJ Finch", "MEK Hussey", "MJ Clarke", "MJ Guptill",
    "SE Marsh", "MR Marsh", "GD McGrath", "A Symonds", "C Green",
    "MP Stoinis", "JR Hazlewood", "A Zampa", "AT Carey", "MS Wade",
    "CA Lynn", "J Fraser-McGurk", "TH David", "JP Inglis", "BJ Haddin",
    # England
    "EJG Morgan", "AD Hales", "JJ Roy", "MM Ali", "SM Curran", "TK Curran",
    "CR Woakes", "MA Wood", "AU Rashid", "LE Plunkett", "JM Bairstow",
    "JE Root", "LS Livingstone", "PD Salt", "HC Brook",
    # New Zealand
    "C Munro", "TG Southee", "DJ Mitchell", "JDS Neesham", "GD Phillips",
    "DP Conway", "R Ravindra", "MJ Santner", "LH Ferguson", "DL Vettori",
    # South Africa
    "HM Amla", "GC Smith", "HH Gibbs", "JP Duminy", "M Morkel", "DW Steyn",
    "Imran Tahir", "CH Morris", "A Nortje", "M Jansen", "G Coetzee",
    "T Shamsi", "WD Parnell", "DA Miller", "AK Markram", "T Stubbs",
    "D Brevis", "JA Morkel", "MV Boucher", "M Ntini", "HE van der Dussen",
    # Sri Lanka
    "AD Mathews", "MD Shanaka", "PVD Chameera", "P Nissanka", "BKG Mendis",
    "PBB Rajapaksa", "M Theekshana", "M Pathirana", "TM Dilshan",
    "BAW Mendis", "NLTC Perera",
    # Pakistan
    "Mohammad Hafeez", "Shoaib Malik", "Misbah-ul-Haq", "Younis Khan",
    # Afghanistan
    "Mohammad Nabi", "Naveen-ul-Haq", "Mujeeb Ur Rahman", "Noor Ahmad",
    "Fazalhaq Farooqi", "Rahmanullah Gurbaz", "Azmatullah Omarzai",
    "Gulbadin Naib",
    # Nepal
    "S Lamichhane",
    # Bangladesh
    "Mashrafe Mortaza",
    # West Indies
    "N Pooran", "SO Hetmyer", "MN Samuels", "CR Brathwaite", "DJG Sammy",
    "JO Holder",
}

# ---------------------------------------------------------------------------
# POPULAR -- recognizable role players / solid careers, one notch above the
# generic domestic-fringe baseline. Weight x2 -- SAME as random, so this
# split is a display convenience only, not a gameplay-affecting choice.
# ---------------------------------------------------------------------------
POPULAR = {
    # India
    "MM Patel", "RP Singh", "P Kumar", "L Balaji", "PP Ojha", "M Kaif",
    "W Jaffer", "MK Tiwary", "KK Nair", "Sachin Baby", "B Indrajith",
    "NV Ojha", "PC Valthaty", "MS Bisla", "AS Rajpoot", "Swapnil Singh",
    "R Sharma", "Iqbal Abdulla", "R Vinay Kumar", "AB Dinda", "S Badrinath",
    "R Dhawan", "STR Binny", "KV Sharma", "DS Kulkarni", "PJ Sangwan",
    "PV Tambe", "M Vijay", "R Bhatia", "SB Wagh", "Parvez Rasool",
    "Sandeep Sharma", "MC Henriques", "K Gowtham", "N Rana",
    "RA Tripathi", "RM Patidar", "DC Jurel", "N Wadhera", "Naman Dhir",
    "V Sooryavanshi", "P Arya", "DS Rathi", "Yash Dayal",
    "Suyash Sharma", "V Nigam", "Musheer Khan", "Shashank Singh",
    "TU Deshpande", "MK Lomror", "GH Vihari", "R Sai Kishore",
    # Australia
    "AJ Tye", "KW Richardson", "NM Coulter-Nile", "JL Pattinson",
    "JP Faulkner", "BCJ Cutting", "DJM Short", "BJ Dwarshuis",
    "PSP Handscomb", "RP Meredith", "XC Bartlett", "SH Johnson",
    "NT Ellis", "AJ Turner", "DR Sams", "DT Christian", "CJ Green",
    "CPL Connolly", "MJ Owen", "GJ Bailey", "CL White", "BJ Rohrer",
    "DJ Thornely", "M Klinger",
    # New Zealand
    "IS Sodhi", "AF Milne", "FH Allen", "KA Jamieson", "JA Duffy",
    "W O'Rourke", "TL Seifert", "MG Bracewell", "DAJ Bracewell",
    "SB Styris", "JD Ryder", "L Ronchi", "JEC Franklin", "JDP Oram",
    "CJ Anderson", "C de Grandhomme", "NL McCullum",
    # South Africa
    "BE Hendricks", "KJ Abbott", "RJ Peterson", "J Botha", "JM Kemp",
    "CK Langeveldt", "F Behardien", "CA Ingram", "RR Rossouw",
    "RD Rickelton", "D Jansen", "D Pretorius", "PWA Mulder", "GF Linde",
    "C Bosch", "KT Maphaka", "GC Viljoen", "N Burger", "MP Breetzke",
    "CJ Dala", "D Wiese",
    # Pakistan
    "Kamran Akmal", "Umar Gul", "Sohail Tanvir", "Salman Butt",
    "Mohammad Asif", "Azhar Mahmood", "Mohammad Ashraful",
    # West Indies
    "E Lewis", "R Powell", "AS Joseph", "FA Allen", "AJ Hosein",
    "KAJ Roach", "S Joseph", "R Shepherd", "OC McCoy", "OF Smith",
    "O Thomas", "KMA Paul", "KK Cooper", "DR Smith", "SS Cottrell",
    "SD Hope", "SE Rutherford", "LMP Simmons",
    # Sri Lanka
    "MDKJ Perera", "CK Kapugedera", "MF Maharoof", "KMDN Kulasekara",
    "D Madushanka", "N Thushara", "T Thushara", "A Dananjaya",
    "SMSM Senanayake", "I Udana", "S Randiv", "E Malinga",
    # Afghanistan
    "Karim Janat", "AM Ghazanfar",
    # Bangladesh
    "Litton Das", "Abdur Razzak", "Shakib Al Hasan",
}

def tier_for(short_name: str) -> str:
    if short_name in MARQUEE:
        return "marquee"
    if short_name in GREATS:
        return "greats"
    if short_name in POPULAR:
        return "popular"
    return "random"

df["tier"] = df["short_name"].apply(tier_for)

# ---------------------------------------------------------------------------
# popular_name overrides -- ONLY where there's real confidence about a
# well-known public alias that differs from the registered full_name.
# Everyone else keeps full_name unchanged (the safe default).
# ---------------------------------------------------------------------------
POPULAR_NAME_OVERRIDES = {
    # India
    "Mahendra Singh Dhoni": "MS Dhoni",
    "Rohit Gurunath Sharma": "Rohit Sharma",
    "Sachin Ramesh Tendulkar": "Sachin Tendulkar",
    "Krishnakumar Dinesh Karthik": "Dinesh Karthik",
    "Ravindrasinh Anirudhsinh Jadeja": "Ravindra Jadeja",
    "Yuzvendra Singh Chahal": "Yuzvendra Chahal",
    "Kannaur Lokesh Rahul": "KL Rahul",
    "Bhuvneshwar Kumar Singh": "Bhuvneshwar Kumar",
    "Jasprit Jasbirsingh Bumrah": "Jasprit Bumrah",
    "Hardik Himanshu Pandya": "Hardik Pandya",
    "Suryakumar Ashok Yadav": "Suryakumar Yadav",
    "Rishabh Rajendra Pant": "Rishabh Pant",
    "Deepak Lokandersingh Chahar": "Deepak Chahar",
    "Axar Rajeshbhai Patel": "Axar Patel",
    "Harshal Vikram Patel": "Harshal Patel",
    "Mohammed Shami Ahmed": "Mohammed Shami",
    "Krunal Himanshu Pandya": "Krunal Pandya",
    "Wriddhiman Prasanta Saha": "Wriddhiman Saha",
    "Parthiv Ajay Patel": "Parthiv Patel",
    "Cheteshwar Arvind Pujara": "Cheteshwar Pujara",
    "Ajinkya Madhukar Rahane": "Ajinkya Rahane",
    "Suresh Kumar Raina": "Suresh Raina",
    "Robin Venu Uthappa": "Robin Uthappa",
    "Manish Krishnanand Pandey": "Manish Pandey",
    "Sourav Chandidas Ganguly": "Sourav Ganguly",
    "Rahul Sharad Dravid": "Rahul Dravid",
    "Sanju Viswanath Samson": "Sanju Samson",
    "Ambati Thirupathi Rayudu": "Ambati Rayudu",
    "Yusuf Khan Pathan": "Yusuf Pathan",
    "Irfan Khan Pathan": "Irfan Pathan",
    "Vangipurappu Venkata Sai Laxman": "VVS Laxman",
    "Bhardwaj Sai Sudharsan": "Sai Sudharsan",
    "Namboori Thakur Tilak Varma": "Tilak Varma",
    "Kaki Nitish Kumar Reddy": "Nitish Kumar Reddy",
    "Ishan Pranav Kumar Pandey Kishan": "Ishan Kishan",
    "Muralikrishna Prasidh Krishna": "Prasidh Krishna",
    "Mayank Prabhu Yadav": "Mayank Yadav",
    "Mahipal Krishan Lomror": "Mahipal Lomror",
    "Venkatesh Rajasekaran Iyer": "Venkatesh Iyer",
    "Gade Hanuma Vihari": "Hanuma Vihari",
    "Ravisrinivasan Sai Kishore": "Sai Kishore",
    "Ruturaj Dashrat Gaikwad": "Ruturaj Gaikwad",
    "Yashasvi Bhupendra Kumar Jaiswal": "Yashasvi Jaiswal",
    "Rinku Khanchand Singh": "Rinku Singh",
    "Rahul Ajay Tripathi": "Rahul Tripathi",
    "Rajat Manohar Patidar": "Rajat Patidar",
    "Shreyas Santosh Iyer": "Shreyas Iyer",
    "Harshit Pradeep Rana": "Harshit Rana",
    "Thangarasu Natarajan": "T Natarajan",
    "Deepak Jagbir Hooda": "Deepak Hooda",
    "Dhruv Chand Jurel": "Dhruv Jurel",
    "Varun Chakravarthy Vinod": "Varun Chakravarthy",
    "Ravichandran Ashwin": "R Ashwin",
    # Sri Lanka
    "Warnakulasuriya Patabendige Ushantha Joseph Chaminda Vaas": "Chaminda Vaas",
    "Balapuwaduge Ajantha Winslow Mendis": "Ajantha Mendis",
    "Balapuwaduge Kusal Gimhan Mendis": "Kusal Mendis",
    "Balapuwaduge Manukulasuriya Amith Jeevan Mendis": "Jeevan Mendis",
    "Congenige Randhi Dilhara Fernando": "Dilhara Fernando",
    "Demuni Nuwan Tharanga Zoysa": "Nuwan Zoysa",
    "Kulasekara Mudiyanselage Dinesh Nuwan Kulasekara": "Nuwan Kulasekara",
    "Lokumarakkalage Dilshan Madushanka": "Dilshan Madushanka",
    "Magina Thilan Thushara Mirando": "Thilan Thushara",
    "Mahamarakkala Kurukulasooriya Patabendige Akila Dananjaya Perera": "Akila Dananjaya",
    "Morawakage Maheesh Theekshana": "Maheesh Theekshana",
    "Narangoda Liyanaarachchilage Thisara Chirantha Perera": "Thisara Perera",
    "Pasqual Handi Kamindu Dilanka Mendis": "Kamindu Mendis",
    "Pathira Vasan Dushmantha Chameera": "Dushmantha Chameera",
    "Pathum Nissanka Silva": "Pathum Nissanka",
    "Pinnaduwage Wanindu Hasaranga de Silva": "Wanindu Hasaranga",
    "Pramod Bhanuka Bandara Rajapaksa": "Bhanuka Rajapaksa",
    "Senanayake Mudiyanselage Sachithra Madhushanka Senanayake": "Sachithra Senanayake",
    "Tillakaratne Mudiyanselage Dilshan": "Tillakaratne Dilshan",
    "Ilandari Dewage Nuwan Thushara": "Nuwan Thushara",
    "Kiribathgala Kankanamalage Eshan Malinga Dharmasena": "Eshan Malinga",
    "Hewa Kaluhalamullage Suraj Randiv Kaluhalamulla": "Suraj Randiv",
    "Isuru Udana Tillakaratna": "Isuru Udana",
    "Denagamage Proboth Mahela de Silva Jayawardene": "Mahela Jayawardene",
    "Kumar Chokshanada Sangakkara": "Kumar Sangakkara",
    "Muthiah Muralidaran": "Muttiah Muralitharan",
    "Separamadu Lasith Malinga": "Lasith Malinga",
    "Sanath Teran Jayasuriya": "Sanath Jayasuriya",
    # Pakistan / Afghanistan
    "Sahibzada Mohammad Shahid Khan Afridi": "Shahid Afridi",
    "Misbah-ul-Haq Khan Niazi": "Misbah-ul-Haq",
    "Mohammad Younis Khan": "Younis Khan",
    "Rashid Khan Arman": "Rashid Khan",
    "Mohammad Imran Tahir": "Imran Tahir",
    # West Indies
    "Andre Dwayne Russell": "Andre Russell",
    "Dwayne John Bravo": "Dwayne Bravo",
    "Kieron Adrian Pollard": "Kieron Pollard",
    "Christopher Henry Gayle": "Chris Gayle",
    "Sunil Philip Narine": "Sunil Narine",
    "Marlon Nathaniel Samuels": "Marlon Samuels",
    "Carlos Ricardo Brathwaite": "Carlos Brathwaite",
    "Daren Julius Garvey Sammy": "Daren Sammy",
    "Jason Omar Holder": "Jason Holder",
    "Shimron Odilon Hetmyer": "Shimron Hetmyer",
    "Alzarri Shaheim Joseph": "Alzarri Joseph",
    "Fabian Anthony Allen": "Fabian Allen",
    "Akeal Jerome Hosein": "Akeal Hosein",
    "Kemar Andre Jamal Roach": "Kemar Roach",
    "Jerome Everton Taylor": "Jerome Taylor",
    "Ravindranath Rampaul": "Ravi Rampaul",
    "Fidel Henderson Edwards": "Fidel Edwards",
    "Dwayne Romel Smith": "Dwayne Smith",
    "Lendl Mark Platter Simmons": "Lendl Simmons",
    "Shai Diego Hope": "Shai Hope",
    "Sherfane Eviston Rutherford": "Sherfane Rutherford",
    "Obed  Christopher McCoy": "Obed McCoy",
    "Odean Fabian Smith": "Odean Smith",
    "Oshane Romaine Thomas": "Oshane Thomas",
    "Keemo Mandela Angus Paul": "Keemo Paul",
    "Kevon Keston Cooper": "Kevon Cooper",
    "Ramnaresh Ronnie Sarwan": "Ramnaresh Sarwan",
    "Darren Michael Bravo": "Darren Bravo",
    "Adrian Boris Barath": "Adrian Barath",
    # South Africa
    "Abraham Benjamin de Villiers": "AB de Villiers",
    "Jacques Henry Kallis": "Jacques Kallis",
    "Dale Willem Steyn": "Dale Steyn",
    "Hashim Mahomed Amla": "Hashim Amla",
    "Herschelle Herman Gibbs": "Herschelle Gibbs",
    "Graeme Craig Smith": "Graeme Smith",
    "Jean-Paul Duminy": "JP Duminy",
    "Francois du Plessis": "Faf du Plessis",
    "Aiden Kyle Markram": "Aiden Markram",
    "Anrich Arno Nortje": "Anrich Nortje",
    "Christopher Henry Morris": "Chris Morris",
    "Wayne Dillon Parnell": "Wayne Parnell",
    "Lungisani True-man Ngidi": "Lungi Ngidi",
    "Kyle John Abbott": "Kyle Abbott",
    "Beuran Eric Hendricks": "Beuran Hendricks",
    "Robin John Peterson": "Robin Peterson",
    "Johannes Albertus Morkel": "Albie Morkel",
    "Justin Miles Kemp": "Justin Kemp",
    "Charl Kenneth Langeveldt": "Charl Langeveldt",
    "Shaun Maclean Pollock": "Shaun Pollock",
    "Mark Verdon Boucher": "Mark Boucher",
    "Colin Alexander Ingram": "Colin Ingram",
    "Rilee Roscoe Rossouw": "Rilee Rossouw",
    "Hendrik Erasmus van der Dussen": "Rassie van der Dussen",
    "Ryan David Rickelton": "Ryan Rickelton",
    "Pieter Willem Adriaan Mulder": "Wiaan Mulder",
    "George Fredrik Linde": "George Linde",
    "Kwena Tshegofatso Maphaka": "Kwena Maphaka",
    # Australia
    "Ricky Thomas Ponting": "Ricky Ponting",
    "Adam Craig Gilchrist": "Adam Gilchrist",
    "Shane Keith Warne": "Shane Warne",
    "Glenn James Maxwell": "Glenn Maxwell",
    "Mitchell Aaron Starc": "Mitchell Starc",
    "Steven Peter Devereux Smith": "Steve Smith",
    "Patrick James Cummins": "Pat Cummins",
    "David Andrew Warner": "David Warner",
    "Travis Michael Head": "Travis Head",
    "Michael Edward Killeen Hussey": "Michael Hussey",
    "Michael John Clarke": "Michael Clarke",
    "Shane Robert Watson": "Shane Watson",
    "Aaron James Finch": "Aaron Finch",
    "Shaun Edward Marsh": "Shaun Marsh",
    "Mitchell Ross Marsh": "Mitchell Marsh",
    "Glenn Donald McGrath": "Glenn McGrath",
    "Cameron Donald Green": "Cameron Green",
    "Marcus Peter Stoinis": "Marcus Stoinis",
    "Josh Reginald Hazlewood": "Josh Hazlewood",
    "Alex Tyson Carey": "Alex Carey",
    "Matthew Scott Wade": "Matthew Wade",
    "Christopher Austin Lynn": "Chris Lynn",
    "Jake Matthew Fraser-McGurk": "Jake Fraser-McGurk",
    "Timothy Hays David": "Tim David",
    "Joshua Patrick Inglis": "Josh Inglis",
    "Mitchell Guy Johnson": "Mitchell Johnson",
    "Peter Stephen Patrick Handscomb": "Peter Handscomb",
    "Kane William Richardson": "Kane Richardson",
    "James Lee Pattinson": "James Pattinson",
    "James Peter Faulkner": "James Faulkner",
    "Ashton James Turner": "Ashton Turner",
    "D'Arcy John Matthew Short": "D'Arcy Short",
    "Riley Patrick Meredith": "Riley Meredith",
    "Xavier Colin Bartlett": "Xavier Bartlett",
    "William Peter O'Rourke": "Will O'Rourke",
    "Brendon Barrie McCullum": "Brendon McCullum",
    # England
    "Benjamin Andrew Stokes": "Ben Stokes",
    "Joseph Charles Buttler": "Jos Buttler",
    "Jofra Chioke Archer": "Jofra Archer",
    "Kevin Peter Pietersen": "Kevin Pietersen",
    "Eoin Joseph Gerard Morgan": "Eoin Morgan",
    "Alexander Daniel Hales": "Alex Hales",
    "Jason Jonathan Roy": "Jason Roy",
    "Moeen Munir Ali": "Moeen Ali",
    "Samuel Matthew Curran": "Sam Curran",
    "Thomas Kevin Curran": "Tom Curran",
    "Christopher Roger Woakes": "Chris Woakes",
    "Mark Andrew Wood": "Mark Wood",
    "Adil Usman Rashid": "Adil Rashid",
    "Liam Edward Plunkett": "Liam Plunkett",
    "Jonathan Marc Bairstow": "Jonny Bairstow",
    "Joseph Edward Root": "Joe Root",
    "Liam Stephen Livingstone": "Liam Livingstone",
    "Philip Dean Salt": "Phil Salt",
    "Harry Cherrington Brook": "Harry Brook",
    "Jacob Graham Bethell": "Jacob Bethell",
    "Owais Alam Shah": "Owais Shah",
    "Graham Richard Napier": "Graham Napier",
    "Ravinder Singh Bopara": "Ravi Bopara",
    "Reece James William Topley": "Reece Topley",
    "Tymal Solomon Mills": "Tymal Mills",
    "Christopher James Jordan": "Chris Jordan",
    "David Jonathan Willey": "David Willey",
    "Samuel William Billings": "Sam Billings",
    "William George Jacks": "Will Jacks",
    "Dawid Johannes Malan": "Dawid Malan",
    "Paul David Collingwood": "Paul Collingwood",
    # Additional middle-name trims for greats/marquee (spot-check pass)
    "Ajit Bhalchandra Agarkar": "Ajit Agarkar",
    "Angelo Davis Mathews": "Angelo Mathews",
    "Bradley James Haddin": "Brad Haddin",
    "Daniel Luca Vettori": "Daniel Vettori",
    "Daryl Joseph Mitchell": "Daryl Mitchell",
    "David Andrew Miller": "David Miller",
    "Devon Philip Conway": "Devon Conway",
    "Glenn Dominic Phillips": "Glenn Phillips",
    "James Douglas Sheahan Neesham": "James Neesham",
    "Jaydev Dipakbhai Unadkat": "Jaydev Unadkat",
    "Kane Stuart Williamson": "Kane Williamson",
    "Lachlan Hammond Ferguson": "Lockie Ferguson",
    "Madagamagamage Dasun Shanaka": "Dasun Shanaka",
    "Martin James Guptill": "Martin Guptill",
    "Mashrafe Bin Mortaza": "Mashrafe Mortaza",
    "Mitchell Josef Santner": "Mitchell Santner",
    "Mohit Mahipal Sharma": "Mohit Sharma",
    "Noor Ahmad Lakanwal": "Noor Ahmad",
    "Piyush Pramod Chawla": "Piyush Chawla",
    "Prithvi Pankaj Shaw": "Prithvi Shaw",
    "Shardul Narendra Thakur": "Shardul Thakur",
    "Timothy Grant Southee": "Tim Southee",
    "Trent Alexander Boult": "Trent Boult",
    "Umeshkumar Tilak Yadav": "Umesh Yadav",
}

df["popular_name"] = df.apply(
    lambda r: POPULAR_NAME_OVERRIDES.get(r["full_name"], r["full_name"]), axis=1
)

# ---------------------------------------------------------------------------
# Validation: catch typos -- any curated name that doesn't actually appear
# in the dataset means a mismatch somewhere upstream.
# ---------------------------------------------------------------------------
all_short = set(df["short_name"])
all_full = set(df["full_name"])

bad_tier_names = (MARQUEE | GREATS | POPULAR) - all_short
bad_override_keys = set(POPULAR_NAME_OVERRIDES.keys()) - all_full

if bad_tier_names:
    print(f"!! {len(bad_tier_names)} tier short_names did NOT match any row:")
    for n in sorted(bad_tier_names):
        print("   ", repr(n))
if bad_override_keys:
    print(f"!! {len(bad_override_keys)} popular_name override keys did NOT match any full_name:")
    for n in sorted(bad_override_keys):
        print("   ", repr(n))

print()
print("Tier distribution:")
print(df["tier"].value_counts())
print()
print(f"popular_name overrides applied: {(df['popular_name'] != df['full_name']).sum()} / {len(df)}")

df.to_csv(OUT_PATH, index=False)
print(f"\nWrote {OUT_PATH}")
