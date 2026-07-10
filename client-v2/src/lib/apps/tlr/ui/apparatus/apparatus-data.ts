export interface Apparatus {
	name: string;
	staffing: string;
}

export interface Station {
	id: string;
	number: string;
	address?: string;
	specialties: string[];
	apparatus: Apparatus[];
}

export interface Department {
	name: string;
	stations: Station[];
}

export const departments: Department[] = [
	{
		name: 'Salt Lake City Fire Department',
		stations: [
			{
				id: 's1',
				number: 'Station 1',
				address: '211 S 500 E, Salt Lake City',
				specialties: ['Heavy Rescue'],
				apparatus: [
					{ name: 'Medic Engine 1 (Type 1)', staffing: '4' },
					{ name: 'Truck 1', staffing: '4' },
					{ name: 'Heavy Rescue 1', staffing: 'X' },
					{ name: 'Battalion Chief 1', staffing: '1' }
				]
			},
			{
				id: 's2',
				number: 'Station 2',
				address: '270 W 300 N, Salt Lake City',
				specialties: [],
				apparatus: [
					{ name: 'Medic Engine 2 (Type 1)', staffing: '4' },
					{ name: 'Truck 2', staffing: '4' }
				]
			},
			{
				id: 's3',
				number: 'Station 3',
				address: '2425 S 900 E, Salt Lake City',
				specialties: [],
				apparatus: [
					{ name: 'Medic Engine 3 (Type 1)', staffing: '4' },
					{ name: 'Truck 3', staffing: '4' }
				]
			},
			{
				id: 's4',
				number: 'Station 4',
				address: '830 E 11th Ave, Salt Lake City',
				specialties: ['WUI Response'],
				apparatus: [
					{ name: 'Engine 4 (Type 1)', staffing: '4' },
					{ name: 'Engine 6041 (Type 6)', staffing: 'X' },
					{ name: 'Engine 6042 (Type 6)', staffing: 'X' }
				]
			},
			{
				id: 's5',
				number: 'Station 5',
				address: '1023 E 900 S, Salt Lake City',
				specialties: [],
				apparatus: [
					{ name: 'Medic Engine 5 (Type 1)', staffing: '4' },
					{ name: 'Squad 5', staffing: '2' }
				]
			},
			{
				id: 's6',
				number: 'Station 6',
				address: '948 W 800 S, Salt Lake City',
				specialties: [],
				apparatus: [
					{ name: 'Medic Engine 6 (Type 1)', staffing: '4' },
					{ name: 'Squad 6', staffing: '2' }
				]
			},
			{
				id: 's7',
				number: 'Station 7',
				address: '273 N 1000 W, Salt Lake City',
				specialties: ['Water Rescue'],
				apparatus: [
					{ name: 'Medic Engine 7 (Type 1)', staffing: '4' },
					{ name: 'Water Rescue 7', staffing: 'X' }
				]
			},
			{
				id: 's8',
				number: 'Station 8',
				address: '15 W 13000 S, Salt Lake City',
				specialties: [],
				apparatus: [
					{ name: 'Medic Engine 8 (Type 1)', staffing: '4' },
					{ name: 'Truck 8', staffing: '4' }
				]
			},
			{
				id: 's9',
				number: 'Station 9',
				address: '5822 W Amelia Earhart Drive, Salt Lake City',
				specialties: ['WUI Response'],
				apparatus: [
					{ name: 'Quint 9 (Type 1 Ladder)', staffing: '4' },
					{ name: 'Engine 6091 (Type 6)', staffing: 'X' },
					{ name: 'Engine 6092 (Type 6)', staffing: 'X' },
					{ name: 'Water Tender', staffing: 'X' }
				]
			},
			{
				id: 's10',
				number: 'Station 10',
				address: '785 Arapeen Drive, Salt Lake City',
				specialties: ['HazMat', 'Air & Light'],
				apparatus: [
					{ name: 'Engine 10 (Type 1)', staffing: '4' },
					{ name: 'HazMat 10', staffing: 'X' },
					{ name: 'Utility 10 (Air & Light)', staffing: 'X' }
				]
			},
			{
				id: 's11',
				number: 'Station 11',
				address: '581 N 2360 W, Salt Lake City',
				specialties: ['ARFF'],
				apparatus: [
					{ name: 'Medic Engine 11 (Type 1)', staffing: '4' },
					{ name: 'RED 2 (ARFF Command)', staffing: '1' },
					{ name: 'RED 3 (ARFF Crash)', staffing: '1' },
					{ name: 'RED 4 (ARFF Crash)', staffing: '1' },
					{ name: 'Battalion Chief 2', staffing: '1' }
				]
			},
			{
				id: 's12',
				number: 'Station 12',
				address: '1085 N 4030 W, Salt Lake City',
				specialties: ['ARFF'],
				apparatus: [
					{ name: 'Medic Engine 12 (Type 1)', staffing: '4' },
					{ name: 'RED 1 (ARFF Command)', staffing: '1' },
					{ name: 'RED 5 (ARFF Crash)', staffing: '1' },
					{ name: 'RED 6 (ARFF Crash)', staffing: '1' },
					{ name: 'Squad 12', staffing: '2' }
				]
			},
			{
				id: 's13',
				number: 'Station 13',
				address: '2360 E Parleys Way, Salt Lake City',
				specialties: ['WUI Response'],
				apparatus: [
					{ name: 'Engine 13 (Type 1)', staffing: '4' },
					{ name: 'Engine 6131 (Type 6)', staffing: 'X' },
					{ name: 'Engine 3131 (Type 3)', staffing: 'X' }
				]
			},
			{
				id: 's14',
				number: 'Station 14',
				address: '1285 S 3800 W, Salt Lake City',
				specialties: ['HazMat', 'Air & Light', 'Special Ops'],
				apparatus: [
					{ name: 'Quint 14 (Type 1 Ladder)', staffing: '4' },
					{ name: 'Engine 6141 (Type 6)', staffing: 'X' },
					{ name: 'Engine 6142 (Type 6)', staffing: 'X' },
					{ name: 'Hazmat 14', staffing: 'X' },
					{ name: 'Special Ops 14', staffing: 'X' }
				]
			}
		]
	},
	{
		name: 'Unified Fire Authority',
		stations: [
			{
				id: 's101',
				number: 'Station 101',
				address: '790 E 3900 S, Millcreek',
				specialties: [],
				apparatus: [
					{ name: 'Medic Engine 101 (Type 1)', staffing: '4' },
					{ name: 'Medic Ambulance 101', staffing: '2' },
					{ name: 'Battalion Chief 11', staffing: '1' }
				]
			},
			{
				id: 's102',
				number: 'Station 102',
				address: '8608 W Magna Main Street, Magna',
				specialties: ['WUI Response'],
				apparatus: [
					{ name: 'Medic Engine 102 (Type 1)', staffing: '4' },
					{ name: 'Engine 6102 (Type 6)', staffing: 'X' }
				]
			},
			{
				id: 's103',
				number: 'Station 103',
				address: '5916 W 13100 S, Herriman',
				specialties: ['Wildland Duty Officer', 'WUI Response'],
				apparatus: [
					{ name: 'Medic Engine 103 (Type 1/3)', staffing: '4' },
					{ name: 'Ambulance 203', staffing: '2 (PL 12hr)' },
					{ name: 'WLDO Supervisor Truck', staffing: 'X' }
				]
			},
			{
				id: 's104',
				number: 'Station 104',
				address: '2210 E Murray-Holladay Road, Holladay',
				specialties: [],
				apparatus: [
					{ name: 'Medic Engine 104 (Type 1)', staffing: '4' },
					{ name: 'Medic Ambulance 104', staffing: '2' }
				]
			},
			{
				id: 's106',
				number: 'Station 106',
				address: '1911 E 3300 S, Millcreek',
				specialties: ['WUI Response'],
				apparatus: [
					{ name: 'Medic Ladder 106 (Type 1)', staffing: '4' },
					{ name: 'Medic Ambulance 206', staffing: '2 (PL 12hr)' },
					{ name: 'Water Tender 106 (Type 1)', staffing: 'X' },
					{ name: 'Engine 6106 (Type 6)', staffing: 'X' }
				]
			},
			{
				id: 's107',
				number: 'Station 107',
				address: '6305 S 5600 W, West Jordan',
				specialties: [],
				apparatus: [
					{ name: 'Medic Engine 107 (Type 1)', staffing: '4' },
					{ name: 'Medic Ambulance 107', staffing: '2' }
				]
			},
			{
				id: 's108',
				number: 'Station 108',
				address: '8036 Old Prospect Ave, Brighton',
				specialties: ['WUI Response'],
				apparatus: [
					{ name: 'Medic Engine 108 (Type 1/3)', staffing: '4' },
					{ name: 'Medic Ambulance 108', staffing: 'X' },
					{ name: 'Engine 6108 (Type 6)', staffing: 'X' }
				]
			},
			{
				id: 's109',
				number: 'Station 109',
				address: '4444 W 5415 S, Kearns',
				specialties: ['WUI Response'],
				apparatus: [
					{ name: 'Medic Ladder 109 (Type 1)', staffing: '4' },
					{ name: 'Medic Ambulance 109', staffing: '2' },
					{ name: 'Engine 6109 (Type 6)', staffing: 'X' }
				]
			},
			{
				id: 's110',
				number: 'Station 110',
				address: '1790 Fort Union Blvd, Cottonwood Heights',
				specialties: ['WUI Response'],
				apparatus: [
					{ name: 'Medic Ladder 110 (Type 1)', staffing: '4' },
					{ name: 'Medic Ambulance 110', staffing: '2' },
					{ name: 'Engine 6110 (Type 6)', staffing: 'X' },
					{ name: 'Battalion Chief 14', staffing: '1' }
				]
			},
			{
				id: 's111',
				number: 'Station 111',
				address: '8215 West 3500 South, Magna',
				specialties: ['WUI Response'],
				apparatus: [
					{ name: 'Medic Ladder 111 (Type 1)', staffing: '4' },
					{ name: 'Medic Ambulance 111', staffing: '2' },
					{ name: 'Water Tender 111 (Type 1)', staffing: 'X' },
					{ name: 'Engine 6111 (Type 6)', staffing: 'X' }
				]
			},
			{
				id: 's112',
				number: 'Station 112',
				address: '3612 Jupiter Drive, Millcreek',
				specialties: ['WUI Response'],
				apparatus: [
					{ name: 'Medic Engine 112 (Type 1)', staffing: '4' },
					{ name: 'Engine 6112 (Type 6)', staffing: 'X' }
				]
			},
			{
				id: 's113',
				number: 'Station 113',
				address: '9523 Bypass Road, Snowbird',
				specialties: [],
				apparatus: [
					{ name: 'Medic Engine 113 (Type 1/3)', staffing: '4' },
					{ name: 'Medic Ambulance 113', staffing: 'X' }
				]
			},
			{
				id: 's115',
				number: 'Station 115',
				address: '8495 W State Highway, Copperton',
				specialties: ['WUI Response', 'Rehab Unit'],
				apparatus: [
					{ name: 'Medic Engine 115 (Type 1)', staffing: '3' },
					{ name: 'Engine 6115 (Type 6)', staffing: 'X' },
					{ name: 'Rehab 115', staffing: 'X' }
				]
			},
			{
				id: 's116',
				number: 'Station 116',
				address: '8303 Wasatch Blvd, Cottonwood Heights',
				specialties: [],
				apparatus: [
					{ name: 'Medic Engine 116 (Type 1)', staffing: '3' },
					{ name: 'Medic Ambulance 216', staffing: '2 (Seasonal)' }
				]
			},
			{
				id: 's117',
				number: 'Station 117',
				address: '4965 S Redwood Road, Taylorsville',
				specialties: ['Heavy Rescue'],
				apparatus: [
					{ name: 'Medic Engine 117 (Type 1)', staffing: '4' },
					{ name: 'Medic Ladder 117 (Type 1)', staffing: '4' },
					{ name: 'Medic Ambulance 217', staffing: '2 (PL 24hr)' },
					{ name: 'Heavy Rescue 117', staffing: 'X' }
				]
			},
			{
				id: 's118',
				number: 'Station 118',
				address: '5317 S 2700 W, Taylorsville',
				specialties: [],
				apparatus: [
					{ name: 'Medic Engine 118 (Type 1)', staffing: '4' },
					{ name: 'Medic Ambulance 118', staffing: '2' },
					{ name: 'Battalion Chief 13', staffing: '1' }
				]
			},
			{
				id: 's119',
				number: 'Station 119',
				address: '5025 Emigration Canyon Rd, Salt Lake City',
				specialties: ['WUI Response'],
				apparatus: [
					{ name: 'Medic Engine 119 (Type 1/3)', staffing: '3' },
					{ name: 'Engine 6119 (Type 6)', staffing: 'X' }
				]
			},
			{
				id: 's120',
				number: 'Station 120',
				address: '13000 S 2700 W, Riverton',
				specialties: ['Wildland'],
				apparatus: [
					{ name: 'Medic Ambulance 120', staffing: '2' },
					{ name: 'Wildland 1', staffing: '1' },
					{ name: 'WL Sup Truck 1', staffing: '1' },
					{ name: 'WL SL Chase Truck 1', staffing: '1' },
					{ name: 'WL SL Chase Truck 2', staffing: '1' },
					{ name: 'Crew Carrier 1', staffing: '10' },
					{ name: 'Crew Carrier 2', staffing: '10' },
					{ name: 'Engine 301 (Type 3)', staffing: '2' },
					{ name: 'Engine 302 (Type 3)', staffing: '4' },
					{ name: 'Fuels Crew Chase Truck 1', staffing: '2' },
					{ name: 'Fuels Crew Chase Truck 2', staffing: '2' },
					{ name: 'Fuels Crew Type 6', staffing: '4' }
				]
			},
			{
				id: 's121',
				number: 'Station 121',
				address: '4146 W 12600 S, Riverton',
				specialties: ['Heavy Rescue'],
				apparatus: [
					{ name: 'Medic Ladder 121 (Type 1)', staffing: '4' },
					{ name: 'Medic Ambulance 121', staffing: '2' },
					{ name: 'Heavy Rescue 121', staffing: 'X' }
				]
			},
			{
				id: 's123',
				number: 'Station 123',
				address: '4850 W Patriot Ridge Drive, Herriman',
				specialties: ['Surface Water Rescue', 'WUI Response'],
				apparatus: [
					{ name: 'Medic Engine 123 (Type 1)', staffing: '4' },
					{ name: 'Event Ambulance 223', staffing: '2 (Event)' },
					{ name: 'Engine 6123 (Type 6)', staffing: 'X' },
					{ name: 'Water Tender 123 (Type 1)', staffing: 'X' },
					{ name: 'Battalion Chief 12', staffing: '1' }
				]
			},
			{
				id: 's124',
				number: 'Station 124',
				address: '12662 S 1300 W, Riverton',
				specialties: ['HazMat'],
				apparatus: [
					{ name: 'Medic Engine 124 (Type 1)', staffing: '4' },
					{ name: 'HazMat 124', staffing: 'X' }
				]
			},
			{
				id: 's125',
				number: 'Station 125',
				address: '655 W 7720 S, Midvale',
				specialties: ['WUI Response'],
				apparatus: [
					{ name: 'Medic Engine 125 (Type 1)', staffing: '4' },
					{ name: 'Medic Ambulance 225', staffing: '2 (PL 24hr)' },
					{ name: 'Engine 6125 (Type 6)', staffing: 'X' }
				]
			},
			{
				id: 's126',
				number: 'Station 126',
				address: '607 E 7200 S, Midvale',
				specialties: ['HazMat'],
				apparatus: [
					{ name: 'Medic Engine 126 (Type 1)', staffing: '4' },
					{ name: 'Medic Ambulance 126', staffing: '2' },
					{ name: 'HazMat 126', staffing: 'X' },
					{ name: 'Operations Chief', staffing: '1' }
				]
			},
			{
				id: 's251',
				number: 'Station 251',
				address: '3726 N Pony Express Pkwy, Eagle Mountain',
				specialties: [],
				apparatus: [
					{ name: 'Medic Engine 251 (Type 1/3)', staffing: '4' },
					{ name: 'Medic Ambulance 251', staffing: 'X' }
				]
			},
			{
				id: 's252',
				number: 'Station 252',
				address: '3785 E Pony Express Pkwy, Eagle Mountain',
				specialties: [],
				apparatus: [
					{ name: 'Medic Engine 252 (Type 1/3)', staffing: '4' },
					{ name: 'Medic Ambulance 252', staffing: 'X' }
				]
			},
			{
				id: 's253',
				number: 'Station 253',
				address: '1208 Mid Valley Road, Eagle Mountain',
				specialties: ['WUI Response'],
				apparatus: [
					{ name: 'Medic Ladder 253 (Type 1)', staffing: '4' },
					{ name: 'Medic Ambulance 253', staffing: '2' },
					{ name: 'Water Tender 253 (Type 1)', staffing: 'X' },
					{ name: 'Engine 6253 (Type 6)', staffing: 'X' }
				]
			}
		]
	},
	{
		name: 'Draper City Fire Department',
		stations: [
			{
				id: 's21',
				number: 'Station 21',
				address: '780 E 12300 S, Draper',
				specialties: ['WUI Response'],
				apparatus: [
					{ name: 'Medic Ladder 21 (Type 1)', staffing: '3' },
					{ name: 'Medic Ambulance 21', staffing: '2' },
					{ name: 'Engine 621 (Type 6)', staffing: 'X' },
					{ name: 'Water Tender 21', staffing: 'X' }
				]
			},
			{
				id: 's22',
				number: 'Station 22',
				address: '14324 Fire House Road, Draper',
				specialties: ['WUI Response'],
				apparatus: [
					{ name: 'Medic Engine 22 (Type 1)', staffing: '3' },
					{ name: 'Medic Ambulance 22', staffing: '2' },
					{ name: 'Engine 622 (Type 6)', staffing: 'X' },
					{ name: 'Battalion Chief 21', staffing: '1' }
				]
			},
			{
				id: 's23',
				number: 'Station 23',
				address: '14903 Deer Ridge Drive, Draper',
				specialties: [],
				apparatus: [
					{ name: 'Medic Engine 23 (Type 1/3)', staffing: '3' },
					{ name: 'Medic Ambulance 23', staffing: 'X' }
				]
			}
		]
	},
	{
		name: 'Sandy City Fire Department',
		stations: [
			{
				id: 's31',
				number: 'Station 31',
				address: '9295 South 255 West, Sandy',
				specialties: [],
				apparatus: [
					{ name: 'Medic Tower 31 (Type 1 Ladder)', staffing: '3' },
					{ name: 'Medic Ambulance 31', staffing: '2' },
					{ name: 'Battalion Chief 31', staffing: '1' }
				]
			},
			{
				id: 's32',
				number: 'Station 32',
				address: '9475 S 2000 E, Sandy',
				specialties: ['WUI Response'],
				apparatus: [
					{ name: 'Medic Engine 32 (Type 1)', staffing: '3' },
					{ name: 'Medic Ambulance 32', staffing: '2' },
					{ name: 'Engine 632 (Type 6)', staffing: 'X' }
				]
			},
			{
				id: 's33',
				number: 'Station 33',
				address: '2015 E 11270 S, Sandy',
				specialties: ['WUI Response'],
				apparatus: [
					{ name: 'Medic Engine 33 (Type 1)', staffing: '3' },
					{ name: 'Engine 633 (Type 6)', staffing: 'X' }
				]
			},
			{
				id: 's34',
				number: 'Station 34',
				address: '10765 S 700 E, Sandy',
				specialties: ['WUI Response'],
				apparatus: [
					{ name: 'Medic Engine 34 (Type 1)', staffing: '3' },
					{ name: 'Medic Ambulance 34', staffing: '2' },
					{ name: 'Engine 634 (Type 6)', staffing: 'X' }
				]
			},
			{
				id: 's35',
				number: 'Station 35',
				address: '8186 S 1300 E, Sandy',
				specialties: ['HazMat'],
				apparatus: [
					{ name: 'Medic Engine 35 (Type 1)', staffing: '3' },
					{ name: 'HazMat 35', staffing: 'X' }
				]
			}
		]
	},
	{
		name: 'South Salt Lake City Fire Department',
		stations: [
			{
				id: 's41',
				number: 'Station 41',
				address: '2600 S Main Street, South Salt Lake City',
				specialties: [],
				apparatus: [
					{ name: 'Engine 41 (Type 1)', staffing: '3' },
					{ name: 'Medic Ambulance 41', staffing: '2' },
					{ name: 'Battalion Chief 41', staffing: '1' }
				]
			},
			{
				id: 's42',
				number: 'Station 42',
				address: '3265 S 900 W, South Salt Lake',
				specialties: ['WUI Response'],
				apparatus: [
					{ name: 'Ladder 42 (Type 1 Ladder)', staffing: '3' },
					{ name: 'Medic Ambulance 42', staffing: '2' },
					{ name: 'Engine 642 (Type 6)', staffing: 'X' }
				]
			},
			{
				id: 's43',
				number: 'Station 43',
				address: '3620 S West Temple, South Salt Lake',
				specialties: [],
				apparatus: [
					{ name: 'Engine 43 (Type 1)', staffing: '3' },
					{ name: 'Medic Ambulance 43', staffing: '2' }
				]
			}
		]
	},
	{
		name: 'West Jordan City Fire Department',
		stations: [
			{
				id: 's52',
				number: 'Station 52',
				address: '7950 S Redwood Road, West Jordan',
				specialties: [],
				apparatus: [
					{ name: 'Engine 52 (Type 1)', staffing: '3' },
					{ name: 'Medic Ambulance 52', staffing: '2' }
				]
			},
			{
				id: 's53',
				number: 'Station 53',
				address: '7602 Jordan Landing Blvd, West Jordan',
				specialties: ['WUI Response'],
				apparatus: [
					{ name: 'Ladder 53 (Type 1 Tiller)', staffing: '3' },
					{ name: 'Medic Ambulance 53', staffing: '2' },
					{ name: 'Engine 653 (Type 6)', staffing: 'X' },
					{ name: 'Battalion Chief 51', staffing: '1' }
				]
			},
			{
				id: 's54',
				number: 'Station 54',
				address: '9531 S Hawley Park Road, West Jordan',
				specialties: ['Heavy Rescue'],
				apparatus: [
					{ name: 'Engine 54 (Type 1)', staffing: '3' },
					{ name: 'Medic Ambulance 54', staffing: '2' },
					{ name: 'Heavy Rescue 54', staffing: 'X' }
				]
			},
			{
				id: 's55',
				number: 'Station 55',
				address: '7750 S 6400 W, West Jordan',
				specialties: ['WUI Response'],
				apparatus: [
					{ name: 'Engine 55 (Type 1)', staffing: '3' },
					{ name: 'Medic Ambulance 55', staffing: '2' },
					{ name: 'Engine 655 (Type 6)', staffing: 'X' }
				]
			}
		]
	},
	{
		name: 'South Jordan City Fire Department',
		stations: [
			{
				id: 's61',
				number: 'Station 61',
				address: '10758 S 1700 W, South Jordan',
				specialties: [],
				apparatus: [
					{ name: 'Medic Ladder 61 (Type 1 Tiller)', staffing: '3' },
					{ name: 'Medic Ambulance 61', staffing: '2' },
					{ name: 'Battalion Chief 61', staffing: '1' }
				]
			},
			{
				id: 's62',
				number: 'Station 62',
				address: '4022 S Jordan Parkway, South Jordan',
				specialties: ['WUI Response'],
				apparatus: [
					{ name: 'Medic Engine 62 (Type 1)', staffing: '3' },
					{ name: 'Medic Ambulance 62', staffing: '2' },
					{ name: 'Engine 362 (Type 3)', staffing: 'X' }
				]
			},
			{
				id: 's63',
				number: 'Station 63',
				address: '10451 S 1055 W, South Jordan',
				specialties: ['WUI Response', 'HazMat'],
				apparatus: [
					{ name: 'Medic Engine 63 (Type 1)', staffing: '3' },
					{ name: 'Medic Ambulance 63', staffing: '2' },
					{ name: 'Engine 663 (Type 6)', staffing: 'X' }
				]
			},
			{
				id: 's64',
				number: 'Station 64',
				address: '5443 W Lake Avenue, South Jordan',
				specialties: ['Heavy Rescue'],
				apparatus: [
					{ name: 'Heavy Medic Engine 64 (Type 1)', staffing: '3' },
					{ name: 'Medic Ambulance 64', staffing: '2' },
					{ name: 'Medic Ambulance 264', staffing: '2 (EMS)' }
				]
			}
		]
	},
	{
		name: 'West Valley City Fire Department',
		stations: [
			{
				id: 's71',
				number: 'Station 71',
				address: '4160 S 6400 W, West Valley',
				specialties: [],
				apparatus: [
					{ name: 'Engine 71 (Type 1)', staffing: '3' },
					{ name: 'Medic Ambulance 71', staffing: '2' }
				]
			},
			{
				id: 's72',
				number: 'Station 72',
				address: '4314 W 4100 S, West Valley',
				specialties: [],
				apparatus: [
					{ name: 'Engine 72 (Type 1)', staffing: '3' },
					{ name: 'Medic Ambulance 73', staffing: '2' },
					{ name: 'Battalion Chief 71', staffing: '1' }
				]
			},
			{
				id: 's73',
				number: 'Station 73',
				address: '2834 S 2700 W, West Valley',
				specialties: ['WUI Response'],
				apparatus: [
					{ name: 'Ladder 73 (Type 1 Ladder)', staffing: '3' },
					{ name: 'Medic Ambulance 73', staffing: '2' },
					{ name: 'Engine 473 (Type 4)', staffing: 'X' }
				]
			},
			{
				id: 's74',
				number: 'Station 74',
				address: '5545 W 3100 S, West Valley',
				specialties: ['Heavy Rescue', 'WUI Response'],
				apparatus: [
					{ name: 'Tower 74 (Type 1 Tiller)', staffing: '3' },
					{ name: 'Medic Ambulance 74', staffing: '2' },
					{ name: 'Medic Ambulance 744', staffing: '2 (EMS)' },
					{ name: 'Heavy Rescue 74', staffing: 'X' },
					{ name: 'Engine 674 (Type 6)', staffing: 'X' }
				]
			},
			{
				id: 's75',
				number: 'Station 75',
				address: '3660 S 1950 W, West Valley',
				specialties: [],
				apparatus: [
					{ name: 'Engine 75', staffing: '3' },
					{ name: 'Medic Ambulance 75', staffing: '2' }
				]
			},
			{
				id: 's76',
				number: 'Station 76',
				address: '5372 Upper Ridge Road, West Valley',
				specialties: ['WUI Response'],
				apparatus: [
					{ name: 'Ladder 76 (Type 1 Ladder)', staffing: '3' },
					{ name: 'Engine 376 (Type 3)', staffing: 'X' },
					{ name: 'Engine 676 (Type 6)', staffing: 'X' }
				]
			}
		]
	},
	{
		name: 'Murray City Fire Department',
		stations: [
			{
				id: 's81',
				number: 'Station 81',
				address: '4848 Box Elder St, Murray',
				specialties: ['WUI Response'],
				apparatus: [
					{ name: 'Engine 81 (Type 1)', staffing: '3' },
					{ name: 'Medic Ambulance 81', staffing: '2' },
					{ name: 'Engine 681 (Type 6)', staffing: 'X' },
					{ name: 'Battalion Chief 81', staffing: '1' }
				]
			},
			{
				id: 's82',
				number: 'Station 82',
				address: '996 Vine Street, Murray',
				specialties: [],
				apparatus: [
					{ name: 'Engine 82 (Type 1)', staffing: '3' },
					{ name: 'Medic Ambulance 82', staffing: '2' }
				]
			},
			{
				id: 's83',
				number: 'Station 83',
				address: '484 W 5900 S, Murray',
				specialties: ['WUI Response'],
				apparatus: [
					{ name: 'Engine 83 (Type 1)', staffing: '3' },
					{ name: 'Medic Ambulance 83', staffing: '2' }
				]
			}
		]
	},
	{
		name: 'Bluffdale City Fire Department',
		stations: [
			{
				id: 's91',
				number: 'Station 91',
				address: '14250 S 2200 W, Bluffdale',
				specialties: ['WUI Response'],
				apparatus: [
					{ name: 'Medic Engine 91 (Type 1) - Tandem', staffing: '2' },
					{ name: 'Medic Ambulance 91 - Tandem', staffing: '2' },
					{ name: 'Engine 691 (Type 6)', staffing: 'X' },
					{ name: 'Water Tender 93 (Type 1)', staffing: 'X' },
					{ name: 'Battalion Chief 91', staffing: '1' }
				]
			},
			{
				id: 's92',
				number: 'Station 92',
				address: '14895 Noell Nelson Drive, Bluffdale',
				specialties: ['WUI Response'],
				apparatus: [
					{ name: 'Medic Engine 92 (Type 1)', staffing: '2' },
					{ name: 'Medic Ambulance 92', staffing: '2' },
					{ name: 'Engine 692 (Type 6)', staffing: 'X' },
					{ name: 'Engine 693 (Type 6)', staffing: 'Seasonal' }
				]
			}
		]
	}
];

export const specialtyColors: Record<string, string> = {
	'WUI Response': 'bg-amber-950/60 text-amber-400 border-amber-800/50',
	HazMat: 'bg-lime-950/60 text-lime-400 border-lime-800/50',
	'Heavy Rescue': 'bg-blue-950/60 text-blue-400 border-blue-800/50',
	ARFF: 'bg-red-950/60 text-red-400 border-red-800/50',
	'Water Rescue': 'bg-cyan-950/60 text-cyan-400 border-cyan-800/50',
	'Surface Water Rescue': 'bg-cyan-950/60 text-cyan-400 border-cyan-800/50',
	Wildland: 'bg-green-950/60 text-green-400 border-green-800/50',
	'Wildland Duty Officer': 'bg-green-950/60 text-green-400 border-green-800/50',
	'Air & Light': 'bg-violet-950/60 text-violet-400 border-violet-800/50',
	'Special Ops': 'bg-purple-950/60 text-purple-400 border-purple-800/50',
	'Rehab Unit': 'bg-orange-950/60 text-orange-400 border-orange-800/50'
};

export function specialtyClass(s: string): string {
	return specialtyColors[s] ?? 'bg-muted/40 text-muted-foreground border-border/40';
}

export function staffingClass(s: string): string {
	if (s === 'X') return 'text-muted-foreground/60';
	if (s.includes('Seasonal')) return 'text-amber-500';
	return 'text-foreground';
}

export function staffingLabel(s: string): string {
	return s === 'X' ? 'Cross' : s;
}
