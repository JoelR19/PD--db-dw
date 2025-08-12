async function pruebaServer() {
    try{

        const res = await fetch("http://localhost:3000")
        const data = await res.json()

        document.getElementById("text").textContent = data.text
        console.log(data)
    }catch (error){
        console.error("papaya", error)
    }

}

pruebaServer()