
import React, {useState, useEffect} from 'React';


export default Counter = (count) => {

const [emoji, setEmoji] = useState(null) 


const getEmoji = (count) => {
    fetch(`https://okdqm6aeoc.execute-api.us-east-1.amazonaws.com/prod/try?count=${count}`)
        .then(response => response.json())
        .then(data => setEmoji(data.input))
}

useEffect(() => {
    getEmoji(count);

}, [count])


return (
    <>
    <div>
        <p>Try! {emoji}</p>
    </div>
    </>
)

}